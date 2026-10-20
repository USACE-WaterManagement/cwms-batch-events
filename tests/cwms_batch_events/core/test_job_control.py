from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.models import JobStatus
from tests.factories import make_user


def database(job_status=JobStatus.PENDING, external_job_id=None, dispatch_claimed_at=None, runner="batch"):
    job = SimpleNamespace(
        id="job-id", office="SWT", job_status=job_status, external_job_id=external_job_id,
        dispatch_claimed_at=dispatch_claimed_at, end_time=None, batch_status_reason=None,
        cancellation_requested_at=None,
        job_runner=SimpleNamespace(slug=runner),
    )
    db = PostgresJobDatabase(Mock())
    db._load_job_for_update = Mock(return_value=job)
    return db, job


def test_queued_job_is_cancelled_before_dispatch():
    db, job = database()

    result = db.request_job_cancellation(job.id, make_user(), "Operator requested cancellation")

    assert result["action"] == "cancelled"
    assert job.job_status == JobStatus.CANCELLED
    assert job.end_time is not None
    db.db.commit.assert_called()


def test_claimed_job_with_no_external_id_is_not_cancelled_as_safe_queue_work():
    db, job = database(dispatch_claimed_at=datetime.now(timezone.utc))

    try:
        db.request_job_cancellation(job.id, make_user(), "Operator requested cancellation")
    except ValueError as exc:
        assert "outcome is uncertain" in str(exc)
    else:
        raise AssertionError("expected cancellation race to be rejected")
    assert job.job_status == JobStatus.PENDING


def test_running_batch_job_enters_cancelling_state():
    db, job = database(JobStatus.RUNNING, external_job_id="batch-123")

    result = db.request_job_cancellation(job.id, make_user(), "Operator requested cancellation")

    assert result["action"] == "terminate"
    assert result["runner"] == "batch"
    assert job.job_status == JobStatus.CANCELLING


def test_runner_completion_turns_cancelling_job_into_cancelled():
    db, job = database(JobStatus.CANCELLING, external_job_id="batch-123")

    db.update_job_status(job.id, JobStatus.FAILED)

    assert job.job_status == JobStatus.CANCELLED
    assert job.batch_status_reason == "Cancellation confirmed by the job runner."
