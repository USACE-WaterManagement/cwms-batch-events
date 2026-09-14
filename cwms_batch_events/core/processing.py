from datetime import datetime
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import JobStatus


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
        return

    # Idempotency guard
    if STATUS_PRIORITY[status] <= STATUS_PRIORITY[job.job_status]:
        return

    job_id = job.id

    print(f"Updating job `{job_id}` status to `{status}` at {time_iso}")

    db.update_job_status(job_id, status)
