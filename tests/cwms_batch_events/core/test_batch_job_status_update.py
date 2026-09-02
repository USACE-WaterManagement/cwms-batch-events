from datetime import datetime, timezone
from unittest import mock
from unittest.mock import MagicMock

import pytest

from cwms_batch_events.core.models import JobStatus
from cwms_batch_events.core.processing import update_batch_job_status


@pytest.mark.parametrize(
    ("current_status", "new_status"),
    [
        (JobStatus.PENDING, JobStatus.RUNNING),
        (JobStatus.RUNNING, JobStatus.COMPLETED),
        (JobStatus.RUNNING, JobStatus.FAILED),
    ],
)
def test_update_higher_priority_status(current_status, new_status):
    mock_db = MagicMock()
    job = MagicMock()
    job.id = 123
    job.job_status = current_status
    mock_db.get_job_by_external_id.return_value = job

    update_batch_job_status(
        batch_job_id="abc",
        status=new_status,
        time_iso=datetime.now(timezone.utc),
        db=mock_db,
    )

    mock_db.update_job_status.assert_called_once_with(123, new_status)


@pytest.mark.parametrize(
    ("current_status", "new_status"),
    [
        (JobStatus.RUNNING, JobStatus.RUNNING),
        (JobStatus.COMPLETED, JobStatus.RUNNING),
    ],
)
def test_update_duplicate_or_lower_priority_status(current_status, new_status):
    mock_db = MagicMock()
    job = MagicMock()
    job.id = 123
    job.job_status = current_status
    mock_db.get_job_by_external_id.return_value = job

    update_batch_job_status(
        batch_job_id="abc",
        status=new_status,
        time_iso=datetime.now(timezone.utc),
        db=mock_db,
    )

    mock_db.update_job_status.assert_not_called()


def test_update_status_missing_batch_job():
    mock_db = MagicMock()
    job = MagicMock()
    job.id = 123
    job.job_status = JobStatus.COMPLETED
    mock_db.get_job_by_external_id.return_value = None

    with pytest.raises(ValueError):
        update_batch_job_status(
            batch_job_id="abc",
            status=JobStatus.RUNNING,
            time_iso=datetime.now(timezone.utc),
            db=mock_db,
        )


def test_update_invalid_status():
    mock_db = MagicMock()
    job = MagicMock()
    job.id = 123
    job.job_status = JobStatus.PENDING
    mock_db.get_job_by_external_id.return_value = None

    with pytest.raises(ValueError):
        update_batch_job_status(
            batch_job_id="abc",
            status="bad_status",  # pyright: ignore[reportArgumentType]
            time_iso=datetime.now(timezone.utc),
            db=mock_db,
        )


def test_notification_failure_does_not_undo_failed_job_status():
    mock_db = MagicMock()
    queue = MagicMock()
    job = MagicMock()
    job.id = 123
    job.job_status = JobStatus.RUNNING
    mock_db.get_job_by_external_id.return_value = job

    with mock.patch(
        "cwms_batch_events.core.processing.enqueue_failed_job_notifications",
        side_effect=RuntimeError("queue unavailable"),
    ):
        update_batch_job_status(
            batch_job_id="abc",
            status=JobStatus.FAILED,
            time_iso=datetime.now(timezone.utc),
            db=mock_db,
            notification_queue=queue,
        )

    mock_db.update_job_status.assert_called_once_with(123, JobStatus.FAILED)
