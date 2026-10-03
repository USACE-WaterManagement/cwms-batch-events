from datetime import datetime, timezone
import logging
from time import monotonic

from jinja2 import StrictUndefined, meta
from jinja2.sandbox import SandboxedEnvironment
import requests

from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import (
    JobRecord,
    CdaUserListRead,
    EmailNotificationMessage,
    NotificationSeverity,
    RenderedNotification,
)
from cwms_batch_events.core.notification_queue import (
    MESSAGE_VERSION,
    NotificationQueue,
)
from cwms_batch_events.core.settings import settings

logger = logging.getLogger(__name__)

ALLOWED_TEMPLATE_FIELDS = {
    "errorMessage",
    "executionType",
    "externalJobId",
    "jobId",
    "logs",
    "office",
    "repoPath",
    "scriptId",
    "scriptName",
    "scriptSlug",
    "status",
    "username",
}
ALLOWED_TEMPLATE_FILTERS = {"default", "e", "escape", "lower", "replace", "title", "trim", "upper"}
MAX_RENDERED_SUBJECT = 998
MAX_RENDERED_BODY = 100_000
_token_cache: tuple[str, float] | None = None


def _cda_access_token() -> str:
    global _token_cache
    if settings.cda_bearer_token:
        return settings.cda_bearer_token
    if _token_cache is not None and _token_cache[1] > monotonic() + 30:
        return _token_cache[0]
    if not settings.cda_client_id or not settings.cda_client_secret:
        raise ValueError(
            "CDA_CLIENT_ID and CDA_CLIENT_SECRET are required to resolve user lists"
        )
    token_url = settings.cda_token_url or (
        f"{settings.auth_host.rstrip('/')}/realms/{settings.auth_realm}"
        "/protocol/openid-connect/token"
    )
    headers = (
        {"Host": settings.cda_token_host_header}
        if settings.cda_token_host_header
        else None
    )
    response = requests.post(
        token_url,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.cda_client_id,
            "client_secret": settings.cda_client_secret,
        },
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    token = payload["access_token"]
    _token_cache = (token, monotonic() + int(payload.get("expires_in", 300)))
    return token


def get_cda_user_list_emails(office: str, user_list_id: str) -> list[str]:
    root = settings.cda_api_root.rstrip("/")
    response = requests.get(
        f"{root}/user/list/{user_list_id}/members",
        params={"office": office},
        headers={"Authorization": f"Bearer {_cda_access_token()}"},
        timeout=30,
    )
    response.raise_for_status()
    return sorted({
        member["email"].strip().lower()
        for member in response.json().get("members", [])
        if member.get("email")
    })


def get_cda_user_lists(office: str) -> list[CdaUserListRead]:
    root = settings.cda_api_root.rstrip("/")
    response = requests.get(
        f"{root}/user/list",
        params={"office": office},
        headers={"Authorization": f"Bearer {_cda_access_token()}"},
        timeout=30,
    )
    response.raise_for_status()
    return [
        CdaUserListRead.model_validate(user_list)
        for user_list in response.json().get("user-lists", [])
    ]


def _template_environment() -> SandboxedEnvironment:
    environment = SandboxedEnvironment(undefined=StrictUndefined, autoescape=False)
    environment.globals.clear()
    environment.filters = {
        name: value
        for name, value in environment.filters.items()
        if name in ALLOWED_TEMPLATE_FILTERS
    }
    return environment


def _render_template(source: str, data: dict[str, str | None], limit: int) -> str:
    environment = _template_environment()
    parsed = environment.parse(source)
    unknown = meta.find_undeclared_variables(parsed) - ALLOWED_TEMPLATE_FIELDS
    if unknown:
        raise ValueError(
            f"Unsupported notification template fields: {', '.join(sorted(unknown))}"
        )
    rendered = environment.from_string(source).render(**data)
    if len(rendered) > limit:
        raise ValueError(f"Rendered notification exceeds {limit} characters")
    return rendered


def build_job_failure_data(
    job: JobRecord,
    *,
    error_message: str | None = None,
    logs: str | None = None,
) -> dict[str, str | None]:
    return {
        "jobId": str(job.id),
        "scriptId": str(job.script_id) if job.script_id else None,
        "scriptName": job.script_name,
        "scriptSlug": job.script_slug,
        "status": job.job_status.value,
        "repoPath": job.repo_path,
        "executionType": job.execution_type,
        "username": job.username,
        "office": job.office,
        "externalJobId": job.external_job_id,
        "errorMessage": error_message,
        "logs": logs,
    }


def render_notification(
    *,
    subject_template: str,
    body_template: str,
    recipients: list[str],
    data: dict[str, str | None],
) -> RenderedNotification:
    return RenderedNotification(
        recipients=recipients,
        subject=_render_template(subject_template, data, MAX_RENDERED_SUBJECT),
        body=_render_template(body_template, data, MAX_RENDERED_BODY),
        data=data,
    )


def enqueue_failed_job_notifications(
    job: JobRecord,
    db: JobDatabase,
    queue: NotificationQueue | None,
    *,
    error_message: str | None = None,
    logs: str | None = None,
) -> list[str]:
    if queue is None or job.script_id is None:
        return []

    messages: list[str] = []
    rules = db.get_active_job_failed_notification_rules(job.script_id)
    data = build_job_failure_data(job, error_message=error_message, logs=logs)

    for rule in rules:
        recipients = [str(recipient).strip().lower() for recipient in rule.manual_recipients]
        if rule.cda_user_list_id:
            try:
                recipients.extend(
                    get_cda_user_list_emails(
                        rule.cda_user_list_office, rule.cda_user_list_id
                    )
                )
            except requests.RequestException:
                logger.exception(
                    "Could not resolve CDA user list for notification",
                    extra={
                        "office": rule.cda_user_list_office,
                        "user_list_id": rule.cda_user_list_id,
                    },
                )
                if not recipients:
                    raise
        recipients = sorted(set(recipients))
        if not recipients:
            continue

        rendered = render_notification(
            subject_template=rule.template.subject_template,
            body_template=rule.template.body_template,
            recipients=recipients,
            data=data,
        )
        message = EmailNotificationMessage(
            version=MESSAGE_VERSION,
            messageType="job_failed",
            source="cwms-batch-events",
            template=rule.template.slug,
            office=job.office,
            severity=NotificationSeverity.HIGH,
            recipients=rendered.recipients,
            subject=rendered.subject,
            body=rendered.body,
            created_at=datetime.now(timezone.utc),
            data=rendered.data,
        )
        messages.append(queue.send_notification(message))

    return messages
