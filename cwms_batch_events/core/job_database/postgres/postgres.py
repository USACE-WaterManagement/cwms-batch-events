from datetime import datetime, timezone
import json
import re
import logging
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import uuid

from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.display_names import readable_name
from cwms_batch_events.core.batch_details import STATUS_MAP, log_stream
from cwms_batch_events.core.execution import execution_for_config, upgrade_execution, upgrade_saved_configuration
from cwms_batch_events.core.job_database.postgres.models import (
    JobModel,
    JobRunnerModel,
    NotificationTemplateModel,
    ScriptModel,
    ScriptNotificationRuleModel,
)
from cwms_batch_events.core.models import (
    JobRecord,
    JobStatus,
    NotificationEventType,
    NotificationTemplateCreate,
    NotificationTemplateRead,
    NotificationTemplateUpdate,
    ScriptCreate,
    ScriptRead,
    ScriptRunRequest,
    ScriptNotificationRuleCreate,
    ScriptNotificationRuleDetails,
    ScriptNotificationRuleRead,
    ScriptNotificationRuleUpdate,
    ScriptUpdate,
    ExecutionOptions,
)
from cwms_batch_events.core.utils import get_runner_id
from cwms_batch_events.core.dispatch import expire_dispatch
from cwms_batch_events.core.settings import get_settings
from cwms_batch_events.core.display_names import readable_name

logger = logging.getLogger(__name__)


class SlugError(Exception):
    pass


class TemplateInUseError(Exception):
    def __init__(self, usage_count: int):
        self.usage_count = usage_count
        super().__init__(f"Template is used by {usage_count} script{'s' if usage_count != 1 else ''}")


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9\s-]", "", value)
    value = re.sub(r"[\s_-]+", "-", value)
    value = re.sub(r"^-+|-+$", "", value)
    return value


def can_run_script(script: ScriptModel, roles: dict[str, list[str]]) -> bool:
    """Empty script roles require office access, but no additional CDA role."""
    return (
        script.active
        and script.office in roles
        and (not script.roles or not set(script.roles).isdisjoint(roles[script.office]))
    )


class PostgresJobDatabase:
    def __init__(self, db: Session):
        self.db = db

    def _ensure_admin_office(self, office: str, admin_offices: list[str]) -> None:
        if office not in admin_offices:
            raise PermissionError(f"User does not have script admin access for office '{office}'")

    def _load_script_for_admin(self, script_id: uuid.UUID, admin_offices: list[str]) -> ScriptModel:
        script = self.db.get_one(ScriptModel, script_id)
        self._ensure_admin_office(script.office, admin_offices)
        return script

    def get_script_by_id(self, script_id):
        with self.db.begin():
            return ScriptRead.model_validate(self.db.get_one(ScriptModel, script_id))

    def claim_scheduled_dispatch(self, job_id: uuid.UUID) -> bool:
        job = self._load_job_for_update(job_id)
        if job.scheduled_for is None:
            raise ValueError("Not an internal scheduled occurrence")
        if job.job_status != JobStatus.PENDING or job.dispatch_claimed_at is not None or job.external_job_id is not None:
            self.db.commit()
            return False
        job.dispatch_claimed_at = datetime.now(timezone.utc)
        self.db.commit()
        return True

    def claim_dispatch(self, job_id: uuid.UUID) -> dict:
        job = self._load_job_for_update(job_id)
        now = datetime.now(timezone.utc)
        expire_dispatch(job, now, get_settings().dispatch_timeout_minutes)
        claimed = (job.job_status == JobStatus.PENDING and job.external_job_id is None
                   and job.dispatch_claimed_at is None)
        if claimed:
            job.dispatch_claimed_at = now
        result = {"claimed": claimed, "status": job.job_status,
                  "external_job_id": job.external_job_id}
        self.db.commit()
        return result

    def fail_dispatch(self, job_id: uuid.UUID, reason: str) -> None:
        job = self._load_job_for_update(job_id)
        # A late failure callback must never overwrite a linked/running/finished job.
        if job.external_job_id or job.job_status not in (JobStatus.PENDING, JobStatus.DISPATCH_UNKNOWN):
            self.db.commit()
            return
        job.job_status = JobStatus.FAILED
        job.batch_status_reason = reason
        job.end_time = datetime.now(timezone.utc)
        self.db.commit()
        logger.warning("Dispatch rejection recorded", extra={"event": "dispatch_rejected", "job_id": job_id})

    def _record_control_audit(self, job, actor: User, action: str, result: str, reason: str, response: dict | None = None) -> None:
        self.db.execute(text("""INSERT INTO job_control_audit
            (job_id, office, requested_by, action, previous_status, resulting_status, reason, response)
            VALUES (:job_id, :office, :requested_by, :action, :previous_status, :resulting_status, :reason, CAST(:response AS jsonb))"""), {
            "job_id": job.id, "office": job.office, "requested_by": actor.username,
            "action": action, "previous_status": getattr(job, "_control_previous_status", job.job_status),
            "resulting_status": result, "reason": reason,
            "response": json.dumps(response or {}),
        })

    def request_job_cancellation(self, job_id: uuid.UUID, actor: User, reason: str) -> dict:
        job = self._load_job_for_update(job_id)
        status_before = job.job_status
        if status_before in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            self.db.commit()
            return {"action": "already_finished", "status": status_before, "message": "The job has already finished."}
        if status_before == JobStatus.CANCELLING:
            self.db.commit()
            return {"action": "already_requested", "status": status_before, "message": "Cancellation has already been requested."}
        if status_before == JobStatus.PENDING and job.external_job_id is None and job.dispatch_claimed_at is not None:
            self.db.commit()
            raise ValueError("Dispatch is already in progress and its outcome is uncertain. Wait for reconciliation before cancelling.")

        if status_before == JobStatus.PENDING and job.external_job_id is None:
            job._control_previous_status = status_before
            job.job_status = JobStatus.CANCELLED
            job.end_time = datetime.now(timezone.utc)
            job.batch_status_reason = reason
            self._record_control_audit(job, actor, "cancel", JobStatus.CANCELLED, reason)
            self.db.commit()
            return {"action": "cancelled", "status": JobStatus.CANCELLED, "message": "The queued job was removed before dispatch."}

        action = "cancel" if status_before == JobStatus.PENDING else "terminate"
        job._control_previous_status = status_before
        job.job_status = JobStatus.CANCELLING
        job.cancellation_requested_at = datetime.now(timezone.utc)
        job.batch_status_reason = reason
        self._record_control_audit(job, actor, action, JobStatus.CANCELLING, reason)
        self.db.commit()
        return {"action": action, "status": JobStatus.CANCELLING, "external_job_id": job.external_job_id,
                "runner": getattr(getattr(job, "job_runner", None), "slug", "batch"),
                "message": "Cancellation requested. The job will remain visible until the runner confirms the result."}

    def complete_local_cancellation(self, job_id: uuid.UUID, actor: User, reason: str) -> dict:
        job = self._load_job_for_update(job_id)
        if job.job_status == JobStatus.CANCELLED:
            self.db.commit()
            return {"action": "already_finished", "status": JobStatus.CANCELLED, "message": "The job is already cancelled."}
        if job.job_status != JobStatus.CANCELLING:
            self.db.commit()
            return {"action": "already_finished", "status": job.job_status, "message": "The job changed state before it could be stopped."}
        job.job_status = JobStatus.CANCELLED
        job.cancellation_requested_at = None
        job.end_time = datetime.now(timezone.utc)
        job.batch_status_reason = reason
        self._record_control_audit(job, actor, "terminate", JobStatus.CANCELLED, reason)
        self.db.commit()
        return {"action": "cancelled", "status": JobStatus.CANCELLED, "message": "The running local job was stopped."}

    def record_cancellation_failure(self, job_id: uuid.UUID, actor: User, reason: str) -> None:
        job = self._load_job_for_update(job_id)
        if job.job_status == JobStatus.CANCELLING:
            previous = getattr(job, "_control_previous_status", JobStatus.RUNNING)
            job.job_status = previous
            job.cancellation_requested_at = None
            job.batch_status_reason = reason
            self._record_control_audit(job, actor, "cancel", previous, reason, {"error": reason})
        self.db.commit()

    def record_cancellation_response(self, job_id: uuid.UUID, actor: User, action: str, response: dict) -> None:
        job = self._load_job_for_update(job_id)
        self._record_control_audit(job, actor, f"{action}_accepted", job.job_status, job.batch_status_reason or "Cancellation accepted by runner.", response)
        self.db.commit()

    def upgrade_script_configuration(self, script_id: uuid.UUID, actor: User) -> ScriptRead:
        with self.db.begin():
            script = self.db.scalars(select(ScriptModel).where(ScriptModel.id == script_id).with_for_update()).one()
            if script.office not in actor.admin_offices:
                raise PermissionError(f"User does not have script admin access for office '{script.office}'")
            if script.config_version != 4:
                options = upgrade_saved_configuration(script)
                for field, value in options.model_dump(by_alias=False).items():
                    setattr(script, field, value)
                # Upgrading never enables recurring execution.
                script.schedule_enabled = False
                script.schedule_type = "manual"
                script.schedule_minute = None
                script.schedule_cron = None
                script.schedule_timezone = "UTC"
                script.schedule_error = None
                self._record_schedule_author(script, actor)
                self.db.flush()
            result = ScriptRead.model_validate(script)
        return result

    def claim_batch_refresh(self, job_id: uuid.UUID) -> bool:
        # A DB claim shares the 15-second limit across API workers and viewers.
        job = self._load_job_for_update(job_id)
        now = datetime.now(timezone.utc)
        due = not job.batch_checked_at or (now - job.batch_checked_at).total_seconds() >= 15
        if due:
            job.batch_checked_at = now
        self.db.commit()
        return due

    def record_batch_details(self, job_id: uuid.UUID, detail: dict, observed_at: datetime) -> None:
        job = self._load_job_for_update(job_id)
        previous_status = job.batch_status
        previous_stream = job.log_stream
        if job.batch_details_time and observed_at < job.batch_details_time:
            self.db.commit()
            logger.debug("Ignoring older Batch observation", extra={"event": "batch_observation_ignored", "job_id": job_id})
            return
        incoming = STATUS_MAP.get(detail.get("status"))
        # A late RUNNING event must not reopen a finished execution.
        if job.job_status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED) and incoming not in (job.job_status, None):
            self.db.commit()
            logger.debug("Ignoring Batch observation for terminal job", extra={"event": "batch_observation_ignored", "job_id": job_id})
            return
        job.batch_details_time = observed_at
        if incoming:
            if job.job_status == JobStatus.CANCELLING and incoming == JobStatus.FAILED:
                job.job_status = JobStatus.CANCELLED
                job.cancellation_requested_at = None
                job.batch_status_reason = "Cancellation confirmed by AWS Batch."
            else:
                job.job_status = incoming
                job.batch_status_reason = detail.get("statusReason")
            job.batch_status = detail["status"]
        if stream := log_stream(detail):
            job.log_stream = stream
            job.log_group = f"ecs/cwms-batch/{job.office.lower()}-jobs"
        if detail.get("startedAt"):
            job.run_time = datetime.fromtimestamp(detail["startedAt"] / 1000, timezone.utc)
        if detail.get("stoppedAt"):
            job.end_time = datetime.fromtimestamp(detail["stoppedAt"] / 1000, timezone.utc)
        current_status, current_stream = job.batch_status, job.log_stream
        self.db.commit()

        if previous_status != current_status or previous_stream != current_stream:
            logger.info("Batch job state or log stream updated", extra={
                "event": "batch_state_updated", "job_id": job_id,
                "previous_status": previous_status, "batch_status": current_status,
                "stream_available": bool(current_stream),
            })

    def bind_external_job_id(
        self,
        job_id: uuid.UUID,
        external_job_id: str,
    ) -> None:
        job = self._load_job_for_update(job_id)

        if job.external_job_id is None:
            job.external_job_id = external_job_id
            if job.job_status == JobStatus.DISPATCH_UNKNOWN:
                job.job_status = JobStatus.PENDING
                job.batch_status_reason = None
            self.db.commit()
            logger.info("External Batch job linked", extra={"event": "job_linked", "job_id": job_id, "external_job_id": external_job_id})
            return

        if job.external_job_id == external_job_id:
            return

        raise ValueError(
            f"Job {job_id} already bound to {job.external_job_id}, "
            f"cannot bind to {external_job_id}"
        )

    def create_job(self, payload: ScriptRunRequest, user: User) -> JobRecord:
        script = self.db.get_one(ScriptModel, payload.script_id)

        if not can_run_script(script, user.roles):
            raise PermissionError("Not authorized to run requested script")

        options = execution_for_config(script)
        upgraded = None
        if payload.upgrade_to_version is not None:
            if script.office not in user.admin_offices:
                raise PermissionError("Script administrator access is required to upgrade the saved configuration")
            options = upgrade_execution(options, payload.upgrade_to_version)
            upgraded = options.model_copy(deep=True)
        if payload.command_mode is not None or payload.shell_command is not None:
            if options.config_version < 3:
                raise ValueError("Upgrade to version 3 before changing command mode")
            changes = options.model_dump(by_alias=False)
            if payload.command_mode is not None:
                changes["command_mode"] = payload.command_mode
                if payload.command_mode == "arguments":
                    changes["shell_command"] = None
            if payload.shell_command is not None:
                changes["shell_command"] = payload.shell_command
            if changes["command_mode"] == "shell":
                changes["command_args"] = []
            options = ExecutionOptions(**changes)
        if payload.command_args is not None:
            if options.config_version < 2:
                raise ValueError("Custom arguments require a version 2 script")
            if options.command_mode == "shell":
                raise ValueError("Use shellCommand to customize a shell run")
            options.command_args = list(payload.command_args)

        job = JobModel()
        job.id = uuid.uuid4()
        job.script_id = script.id
        job.script_name = script.name
        job.script_slug = script.slug
        job.job_status = JobStatus.PENDING
        job.username = user.username
        job.display_name = readable_name(user.display_name, user.username)
        job.run_trigger = payload.run_trigger
        job.office = script.office
        job.schedule_timezone = getattr(script, "schedule_timezone", None) or "UTC"
        job.config_version = options.config_version
        job.repo_path = options.repo_path
        job.execution_type = options.execution_type
        job.runtime = options.runtime
        job.command_args = list(options.command_args)
        job.command_placeholder = options.command_placeholder
        job.environment_variables = [
            item.model_dump(by_alias=False) for item in options.environment_variables
        ]
        job.resource_size = options.resource_size
        job.command_mode = options.command_mode
        job.shell_command = options.shell_command
        job.release_jar = options.release_jar.model_dump(by_alias=False) if options.release_jar else None
        job.job_runner_id = get_runner_id()

        # Persist only the schema conversion, never custom-run overrides.
        # Validate the entire request before touching the saved registration.
        if upgraded is not None:
            for field, value in upgraded.model_dump(by_alias=False).items():
                setattr(script, field, value)
            script.updated_time = datetime.now()
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        logger.info("Job registered", extra={"event": "job_registered", "job_id": job.id,
            "script_id": job.script_id, "office": job.office, "run_trigger": job.run_trigger,
            "submitted_by": readable_name(job.display_name, job.username)})
        return JobRecord.model_validate(job)

    def get_job_by_id(self, job_id: uuid.UUID) -> JobRecord | None:
        job_model = self.db.get(JobModel, job_id)
        if job_model is None:
            return None
        return JobRecord.model_validate(job_model)

    def get_job_by_external_id(self, ext_job_id: str) -> JobRecord | None:
        job_model = self.db.scalars(
            select(JobModel).where(JobModel.external_job_id == ext_job_id)
        ).one_or_none()
        if job_model is None:
            return None
        return JobRecord.model_validate(job_model)

    def get_latest_jobs_for_offices(self, offices: list[str]) -> list[JobRecord]:
        rows = self.db.scalars(select(JobModel).where(JobModel.office.in_(offices), JobModel.script_id.is_not(None))
            .distinct(JobModel.script_id).order_by(JobModel.script_id, JobModel.created_time.desc(), JobModel.id.desc())).all()
        return [JobRecord.model_validate(row) for row in rows]

    def count_jobs_for_offices(self, offices: list[str], script_id: uuid.UUID | None = None, submitted_from: datetime | None = None, submitted_before: datetime | None = None) -> int:
        return self.db.scalar(
            select(func.count()).select_from(JobModel).where(JobModel.office.in_(offices),
                True if script_id is None else JobModel.script_id == script_id,
                True if submitted_from is None else JobModel.created_time >= submitted_from,
                True if submitted_before is None else JobModel.created_time < submitted_before)
        )

    def get_jobs_for_offices(
        self, offices: list[str], limit: int | None = None, offset: int = 0, script_id: uuid.UUID | None = None,
        submitted_from: datetime | None = None, submitted_before: datetime | None = None
    ) -> list[JobRecord]:
        job_models = self.db.scalars(
            select(JobModel)
            .where(JobModel.office.in_(offices), True if script_id is None else JobModel.script_id == script_id,
                True if submitted_from is None else JobModel.created_time >= submitted_from,
                True if submitted_before is None else JobModel.created_time < submitted_before)
            .order_by(JobModel.created_time.desc(), JobModel.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return [JobRecord.model_validate(model) for model in job_models]

    def get_scripts_for_office(self, office: str):
        script_models = self.db.scalars(
            select(ScriptModel).where(ScriptModel.office == office)
        ).all()
        return [
            ScriptRead.model_validate(script_model) for script_model in script_models
        ]

    def get_script_by_configuration_key(self, configuration_key: uuid.UUID, office: str):
        with self.db.begin():
            script = self.db.scalars(
                select(ScriptModel).where(
                    ScriptModel.configuration_key == configuration_key,
                    ScriptModel.office == office,
                )
            ).one_or_none()
            if script is None:
                return None
            self.db.expunge(script)
        return ScriptRead.model_validate(script) if script else None

    def _load_job_for_update(self, job_id: uuid.UUID):
        job = (
            self.db.query(JobModel)
            .filter(JobModel.id == job_id)
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )

        if not job:
            raise ValueError(f"Job {job_id} does not exist")

        return job

    def remove_script_if_allowed(
        self, script_id: uuid.UUID, admin_offices: list[str]
    ) -> None:
        with self.db.begin():
            script = self.db.get_one(ScriptModel, script_id)
            if script.office not in admin_offices:
                raise PermissionError(
                    f"User does not have script admin access for office '{script.office}'"
                )
            self.db.delete(script)

    def retrieve_script_catalog(self, roles: dict[str, list[str]]) -> list[ScriptRead]:
        """Current method may become inefficient if all_scripts becomes huge. At that
        point, consider storing user roles (temporarily?) in database to perform
        filtering operation entirely within SQL."""
        all_scripts = self.db.scalars(select(ScriptModel)).all()
        runnable_scripts = [
            script
            for script in all_scripts
            if can_run_script(script, roles)
        ]

        return [ScriptRead.model_validate(script) for script in runnable_scripts]

    def store_script(self, payload: ScriptCreate, actor: User | None = None, configuration_key: uuid.UUID | None = None) -> ScriptRead:
        self.db.rollback()
        try:
            with self.db.begin():
                script = ScriptModel()
                if configuration_key is not None:
                    script.configuration_key = configuration_key
                script.config_version = payload.config_version
                script.office = payload.office
                script.name = payload.name
                script.slug = slugify(payload.name)
                script.description = payload.description
                script.repo_path = payload.repo_path
                script.execution_type = payload.execution_type
                script.runtime = payload.runtime
                script.command_args = payload.command_args
                script.command_placeholder = payload.command_placeholder
                script.environment_variables = [
                    item.model_dump(by_alias=False) for item in payload.environment_variables
                ]
                script.command_mode = payload.command_mode
                script.shell_command = payload.shell_command
                script.release_jar = payload.release_jar.model_dump(by_alias=False) if payload.release_jar else None
                script.schedule_enabled = payload.schedule_enabled
                script.schedule_type = payload.schedule_type
                script.schedule_minute = payload.schedule_minute
                script.schedule_cron = payload.schedule_cron
                script.schedule_timezone = payload.schedule_timezone
                self._record_schedule_author(script, actor)
                script.active = payload.active
                script.roles = payload.roles

                job_runners = self.db.scalars(
                    select(JobRunnerModel).where(
                        JobRunnerModel.id.in_(payload.job_runners)
                    )
                ).all()
                if len(job_runners) != len(payload.job_runners):
                    raise ValueError("Invalid job runner ID provided")
                script.job_runners = list(job_runners)

                self.db.add(script)
                self.db.flush()
                self.db.refresh(script)

            return ScriptRead.model_validate(script)

        except IntegrityError as e:
            self.db.rollback()

            if "slug" not in str(e).lower():
                raise

            raise SlugError(
                f"Slug '{slugify(payload.name)}' already in use for office '{payload.office}'"
            )

    def update_job_status(self, job_id: uuid.UUID, status: JobStatus) -> None:
        job = self._load_job_for_update(job_id)
        previous_status = job.job_status

        if previous_status == JobStatus.CANCELLED:
            self.db.commit()
            return
        if previous_status == JobStatus.CANCELLING and status == JobStatus.FAILED:
            status = JobStatus.CANCELLED
            job.cancellation_requested_at = None
            job.batch_status_reason = "Cancellation confirmed by the job runner."

        now = datetime.now(timezone.utc)

        job.job_status = status
        if status == JobStatus.RUNNING:
            job.run_time = now
        elif status in (JobStatus.COMPLETED, JobStatus.FAILED):
            job.end_time = now
        self.db.commit()

        if previous_status != status:
            logger.info("Job status updated", extra={"event": "job_status_updated", "job_id": job_id, "previous_status": previous_status, "status": status})

    def update_script(
        self, script_id: uuid.UUID, payload: ScriptUpdate, admin_offices: list[str], actor: User | None = None
    ) -> ScriptRead:
        self.db.rollback()
        with self.db.begin():
            script = self.db.scalars(select(ScriptModel).where(ScriptModel.id == script_id).with_for_update()).one()
            if script.office not in admin_offices:
                raise PermissionError(
                    f"User does not have script admin access for office '{script.office}'"
                )
            self._record_schedule_author(script, actor)
            if payload.config_version < script.config_version:
                raise ValueError("Configuration versions cannot be downgraded. Reload this script before saving.")
            for field, value in payload.model_dump(by_alias=False).items():
                if field == "job_runners":
                    job_runners = self.db.scalars(
                        select(JobRunnerModel).where(
                            JobRunnerModel.id.in_(payload.job_runners)
                        )
                    ).all()
                    if len(job_runners) != len(payload.job_runners):
                        raise ValueError("Invalid job runner ID provided")
                    script.job_runners = list(job_runners)
                else:
                    setattr(script, field, value)

            script.updated_time = datetime.now()
            self.db.flush()
            self.db.refresh(script)

        return ScriptRead.model_validate(script)

    def get_active_job_failed_notification_rules(self, script_id: uuid.UUID) -> list[ScriptNotificationRuleDetails]:
        rules = self.db.scalars(
            select(ScriptNotificationRuleModel).join(ScriptNotificationRuleModel.template).where(
                ScriptNotificationRuleModel.script_id == script_id,
                ScriptNotificationRuleModel.event_type == NotificationEventType.JOB_FAILED,
                ScriptNotificationRuleModel.active.is_(True),
            )
        ).all()
        return [ScriptNotificationRuleDetails.model_validate(rule) for rule in rules]

    def get_notification_templates_for_office(self, office: str) -> list[NotificationTemplateRead]:
        usage_count = select(func.count(ScriptNotificationRuleModel.id)).where(
            ScriptNotificationRuleModel.template_id == NotificationTemplateModel.id
        ).correlate(NotificationTemplateModel).scalar_subquery()
        rows = self.db.execute(
            select(NotificationTemplateModel, usage_count.label("usage_count"))
            .where(NotificationTemplateModel.office == office)
            .order_by(NotificationTemplateModel.slug)
        ).all()
        return [NotificationTemplateRead.model_validate(model).model_copy(update={"usage_count": count}) for model, count in rows]

    def store_notification_template(self, payload: NotificationTemplateCreate) -> NotificationTemplateRead:
        try:
            with self.db.begin():
                template = NotificationTemplateModel(**payload.model_dump(by_alias=False))
                self.db.add(template)
                self.db.flush()
                self.db.refresh(template)
            return NotificationTemplateRead.model_validate(template)
        except IntegrityError:
            self.db.rollback()
            raise SlugError(f"Slug '{payload.slug}' already in use for office '{payload.office}'")

    def update_notification_template(self, template_id: uuid.UUID, payload: NotificationTemplateUpdate, admin_offices: list[str]) -> NotificationTemplateRead:
        try:
            with self.db.begin():
                template = self.db.get_one(NotificationTemplateModel, template_id)
                self._ensure_admin_office(template.office, admin_offices)
                self._ensure_admin_office(payload.office, admin_offices)
                for field, value in payload.model_dump(by_alias=False).items():
                    setattr(template, field, value)
                template.updated_time = datetime.now(timezone.utc)
                self.db.flush()
                self.db.refresh(template)
            return NotificationTemplateRead.model_validate(template)
        except IntegrityError:
            self.db.rollback()
            raise SlugError(f"Slug '{payload.slug}' already in use for office '{payload.office}'")

    def remove_notification_template_if_allowed(self, template_id: uuid.UUID, admin_offices: list[str]) -> None:
        with self.db.begin():
            template = self.db.get_one(NotificationTemplateModel, template_id)
            self._ensure_admin_office(template.office, admin_offices)
            usage_count = self.db.scalar(select(func.count(ScriptNotificationRuleModel.id)).where(ScriptNotificationRuleModel.template_id == template_id))
            if usage_count:
                raise TemplateInUseError(usage_count)
            self.db.delete(template)

    def get_notification_template_if_allowed(self, template_id: uuid.UUID, admin_offices: list[str]) -> NotificationTemplateRead:
        template = self.db.get_one(NotificationTemplateModel, template_id)
        self._ensure_admin_office(template.office, admin_offices)
        return NotificationTemplateRead.model_validate(template)

    def get_script_notification_rules(self, script_id: uuid.UUID, admin_offices: list[str]) -> list[ScriptNotificationRuleRead]:
        self._load_script_for_admin(script_id, admin_offices)
        rules = self.db.scalars(select(ScriptNotificationRuleModel).where(ScriptNotificationRuleModel.script_id == script_id).order_by(ScriptNotificationRuleModel.created_time)).all()
        return [ScriptNotificationRuleRead.model_validate(rule) for rule in rules]

    def store_script_notification_rule(self, payload: ScriptNotificationRuleCreate, admin_offices: list[str]) -> ScriptNotificationRuleRead:
        with self.db.begin():
            self._validate_rule_payload(payload, admin_offices)
            if payload.active:
                self._deactivate_active_script_notification_rules(payload.script_id, payload.event_type)
            rule = ScriptNotificationRuleModel(**payload.model_dump(by_alias=False))
            self.db.add(rule)
            self.db.flush()
            self.db.refresh(rule)
        return ScriptNotificationRuleRead.model_validate(rule)

    def update_script_notification_rule(self, rule_id: uuid.UUID, payload: ScriptNotificationRuleUpdate, admin_offices: list[str]) -> ScriptNotificationRuleRead:
        with self.db.begin():
            self._validate_rule_payload(payload, admin_offices)
            rule = self.db.get_one(ScriptNotificationRuleModel, rule_id)
            self._ensure_admin_office(rule.script.office, admin_offices)
            if payload.active:
                self._deactivate_active_script_notification_rules(payload.script_id, payload.event_type, exclude_rule_id=rule_id)
            for field, value in payload.model_dump(by_alias=False).items():
                setattr(rule, field, value)
            rule.updated_time = datetime.now(timezone.utc)
            self.db.flush()
            self.db.refresh(rule)
        return ScriptNotificationRuleRead.model_validate(rule)

    def remove_script_notification_rule_if_allowed(self, rule_id: uuid.UUID, admin_offices: list[str]) -> None:
        with self.db.begin():
            rule = self.db.get_one(ScriptNotificationRuleModel, rule_id)
            self._ensure_admin_office(rule.script.office, admin_offices)
            self.db.delete(rule)

    def _validate_rule_payload(self, payload: ScriptNotificationRuleCreate | ScriptNotificationRuleUpdate, admin_offices: list[str]) -> None:
        script = self._load_script_for_admin(payload.script_id, admin_offices)
        template = self.db.get_one(NotificationTemplateModel, payload.template_id)
        if payload.event_type != NotificationEventType.JOB_FAILED:
            raise ValueError("Only job_failed notification rules are supported")
        if template.office != script.office:
            raise ValueError("Notification template office must match script office")
        if payload.cda_user_list_office and payload.cda_user_list_office not in admin_offices:
            raise PermissionError("User does not have script admin access for CDA user list office " f"'{payload.cda_user_list_office}'")
        if not payload.cda_user_list_id and not payload.manual_recipients:
            raise ValueError("A CDA user list or at least one manual recipient is required")

    def _deactivate_active_script_notification_rules(self, script_id: uuid.UUID, event_type: NotificationEventType, exclude_rule_id: uuid.UUID | None = None) -> None:
        statement = select(ScriptNotificationRuleModel).where(
            ScriptNotificationRuleModel.script_id == script_id,
            ScriptNotificationRuleModel.event_type == event_type,
            ScriptNotificationRuleModel.active.is_(True),
        )
        if exclude_rule_id is not None:
            statement = statement.where(ScriptNotificationRuleModel.id != exclude_rule_id)
        for rule in self.db.scalars(statement).all():
            rule.active = False
            rule.updated_time = datetime.now(timezone.utc)

    @staticmethod
    def _record_schedule_author(script: ScriptModel, actor: User | None):
        # Only authenticated API administrators establish recurring execution.
        if actor is None:
            return
        script.schedule_updated_by = actor.username
        script.schedule_updated_name = readable_name(actor.display_name, actor.username)
        script.schedule_updated_at = datetime.now(timezone.utc)
