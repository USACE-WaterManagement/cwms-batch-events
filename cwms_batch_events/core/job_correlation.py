import re
from uuid import UUID

from cwms_batch_events.core.logging_config import build_metadata
from cwms_batch_events.core.settings import settings


def runner_environment(message) -> dict[str, str]:
    metadata = build_metadata()
    environment = {
        "BATCH_EVENTS_JOB_ID": str(message.job_id),
        "BATCH_EVENTS_CORRELATION_ID": str(message.job_id),
        "BATCH_EVENTS_SERVICE_NAME": "cwms-batch-events-job",
        "BATCH_EVENTS_ENVIRONMENT": metadata.get("environment", settings.deployment_environment),
        "BATCH_EVENTS_VERSION": metadata.get("version", settings.build_revision),
    }
    if message.request_id:
        environment["BATCH_EVENTS_REQUEST_ID"] = message.request_id
    return environment


def correlation_from_batch(detail: dict) -> dict:
    """Older Batch events may omit tags; their external ID still links logs."""
    tags = detail.get("tags") or {}
    fields = {"external_job_id": detail.get("jobId")}
    if not isinstance(tags, dict):
        return fields
    try:
        fields["job_id"] = str(UUID(tags["BatchEventsJobId"]))
    except (KeyError, ValueError, TypeError, AttributeError):
        pass
    origin = tags.get("BatchEventsRequestId")
    if isinstance(origin, str) and re.fullmatch(r"[a-f0-9]{32}", origin):
        fields["request_id"] = origin
    return fields
