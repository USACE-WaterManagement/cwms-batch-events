import logging
from datetime import datetime

from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import JobStatus
from cwms_batch_events.core.notifications import enqueue_failed_job_notifications
from cwms_batch_events.core.notification_queue import NotificationQueue

logger = logging.getLogger(__name__)


STATUS_PRIORITY = {
    JobStatus.PENDING: 1,
    JobStatus.RUNNING: 2,
    JobStatus.FAILED: 3,
    JobStatus.COMPLETED: 4,
}


def update_batch_job_status(
    batch_job_id: str,
    status: JobStatus,
    time_iso: datetime,
    db: JobDatabase,
    notification_queue: NotificationQueue | None = None,
):
    job = db.get_job_by_external_id(batch_job_id)

    if not job:
        raise ValueError(f"No job found with batch_job_id={batch_job_id}")

    # Idempotency guard
    if STATUS_PRIORITY[status] <= STATUS_PRIORITY[job.job_status]:
        return

    job_id = job.id

    print(f"Updating job `{job_id}` status to `{status}` at {time_iso}")

    db.update_job_status(job_id, status)

    if status == JobStatus.FAILED and notification_queue is not None:
        try:
            enqueue_failed_job_notifications(job, db, notification_queue)
        except Exception:
            logger.exception(
                "Job status was updated, but its failure notification could not be queued: "
                "job_id=%s batch_job_id=%s",
                job_id,
                batch_job_id,
            )
