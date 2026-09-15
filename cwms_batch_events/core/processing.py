from datetime import datetime, timezone
import logging
from cwms_batch_events.core.log_diagnostics import log_timing
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import JobStatus

logger = logging.getLogger(__name__)


STATUS_PRIORITY = {
    JobStatus.PENDING: 1,
    JobStatus.RUNNING: 2,
    JobStatus.FAILED: 3,
    JobStatus.COMPLETED: 4,
}


def update_batch_job_status(
    batch_job_id: str, status: JobStatus, time_iso: datetime, db: JobDatabase,
    batch_detail: dict | None = None,
):
    job = db.get_job_by_external_id(batch_job_id)

    if not job:
        raise ValueError(f"No job found with batch_job_id={batch_job_id}")

    if batch_detail is not None:
        db.record_batch_details(job.id, batch_detail, time_iso)
        event_time = time_iso.replace(tzinfo=time_iso.tzinfo or timezone.utc)
        log_timing("status_callback", job_id=job.id, batch_status=batch_detail.get("status"),
                   callback_delay_ms=round((datetime.now(timezone.utc) - event_time).total_seconds() * 1000))
        return

    # Idempotency guard
    if STATUS_PRIORITY[status] <= STATUS_PRIORITY[job.job_status]:
        logger.debug("Ignoring duplicate or older job status", extra={
            "event": "job_status_ignored", "job_id": job.id, "status": status,
        })
        return

    job_id = job.id

    db.update_job_status(job_id, status)
