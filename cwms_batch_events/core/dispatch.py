"""An expired dispatch is unresolved, not evidence that its runtime failed."""
from datetime import timedelta

from cwms_batch_events.core.models import JobStatus


DISPATCH_UNKNOWN_REASON = (
    "Dispatch timed out without a linked AWS Batch job. The submission outcome is unknown. "
    "Check dispatcher logs and AWS before rerunning; a job may already have been submitted."
)


def expire_dispatch(job, now, timeout_minutes):
    if (job.job_status == JobStatus.PENDING and not job.external_job_id
            and (job.dispatch_claimed_at or job.created_time) <= now - timedelta(minutes=timeout_minutes)):
        job.job_status = JobStatus.DISPATCH_UNKNOWN
        job.batch_status_reason = DISPATCH_UNKNOWN_REASON
        return True
    return False
