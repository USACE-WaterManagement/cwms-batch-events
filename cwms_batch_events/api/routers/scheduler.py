from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text, select
from uuid import UUID

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import create_session
from cwms_batch_events.core.models import CamelModel
from cwms_batch_events.core.settings import get_settings
from cwms_batch_events.core.schedules import next_run
from cwms_batch_events.core.job_database.postgres.models import ScriptModel, JobModel

router = APIRouter(tags=["scheduler"])


class ScriptScheduleStatus(CamelModel):
    next_run_at: datetime | None
    last_finished_at: datetime | None
    last_run_status: str | None
    last_run_trigger: str | None


@router.get("/scripts/{script_id}/schedule-status", response_model=ScriptScheduleStatus)
def script_schedule_status(script_id: UUID, user: User = Depends(get_current_user)):
    with create_session() as db:
        script = db.get(ScriptModel, script_id)
        if not script or script.office not in user.admin_offices:
            raise HTTPException(404, "Script not found")
        now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
        last = db.scalar(select(JobModel).where(JobModel.script_id == script_id,
            JobModel.office == script.office, JobModel.end_time.is_not(None))
            .order_by(JobModel.end_time.desc()).limit(1))
        upcoming = None
        try:
            upcoming = next_run(script, now)
        except (ValueError, KeyError, TypeError):
            pass  # Invalid legacy data is reported through schedule_error.
        return ScriptScheduleStatus(next_run_at=upcoming,
            last_finished_at=last.end_time if last else None,
            last_run_status=last.job_status if last else None,
            last_run_trigger=last.run_trigger if last else None)


class TaskHealth(CamelModel):
    name: str
    last_success: datetime | None
    healthy: bool


class SchedulerStatus(CamelModel):
    enabled: bool
    tasks: list[TaskHealth]
    pending_delivery: int
    needs_attention: int
    invalid_schedules: int


@router.get("/scheduler/status", response_model=SchedulerStatus)
def scheduler_status(office: str | None = None, user: User = Depends(get_current_user)):
    if "Data Acquisition Mgr" not in user.roles.get("HQ", []):
        raise HTTPException(403, "HQ Data Acquisition Mgr role required")
    if office:
        office = office.upper()
    with create_session() as db:
        now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
        tasks = [TaskHealth(name=row.name, last_success=row.last_success,
            healthy=bool(row.last_success and now - row.last_success < timedelta(minutes=2)))
            for row in db.execute(text("SELECT name, last_success FROM maintenance_tasks ORDER BY name"))]
        pending = db.scalar(text("""SELECT count(*) FROM job_outbox o JOIN jobs j ON j.id=o.job_id
            WHERE (CAST(:office AS text) IS NULL OR j.office=:office) AND o.sent_at IS NULL"""), {"office": office})
        attention = db.scalar(text("""SELECT count(*) FROM jobs
            WHERE (CAST(:office AS text) IS NULL OR office=:office) AND scheduled_for IS NOT NULL AND job_status='Pending'
              AND created_time < :cutoff"""), {"office": office, "cutoff": now - timedelta(minutes=10)})
        invalid = db.scalar(text("SELECT count(*) FROM scripts WHERE (CAST(:office AS text) IS NULL OR office=:office) AND schedule_enabled AND schedule_error IS NOT NULL"), {"office": office})
        return SchedulerStatus(enabled=get_settings().scheduler_enabled, tasks=tasks,
                               pending_delivery=pending, needs_attention=attention, invalid_schedules=invalid)
