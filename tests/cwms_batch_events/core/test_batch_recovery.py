from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.job_logger.cloudwatch import CloudWatchJobLogger


def database():
    job = SimpleNamespace(id=uuid4(), external_job_id="batch-id", office="SWT",
                          job_status="Pending", log_stream=None, log_group=None,
                          batch_status=None, batch_status_reason=None,
                          batch_details_time=None, batch_checked_at=None,
                          run_time=None, end_time=None)
    db = PostgresJobDatabase(Mock())
    db._load_job_for_update = Mock(return_value=job)
    db.get_job_by_id = Mock(return_value=job)
    return db, job


def test_status_and_log_reads_share_throttle_and_recover_stale_pending():
    db, job = database()
    batch, logs = Mock(), Mock()
    batch.describe_jobs.return_value = {"jobs": [{
        "status": "RUNNING", "startedAt": 1000,
        "container": {"logStreamName": "retained-stream"},
    }]}
    logs.get_log_events.return_value = {"events": [{"message": "live output"}]}
    with patch("cwms_batch_events.core.job_logger.cloudwatch.boto3.client", side_effect=[batch, logs]):
        logger = CloudWatchJobLogger(db)
    assert logger.refresh_job(job.id).job_status == "Running"
    assert logger.get_log_page(job.id).logs == "live output"
    logger.refresh_job(job.id)
    batch.describe_jobs.assert_called_once()
    assert job.run_time == datetime.fromtimestamp(1, timezone.utc)
    job.batch_checked_at -= timedelta(seconds=16)
    logger.refresh_job(job.id)
    assert batch.describe_jobs.call_count == 2


def test_finished_logs_survive_expired_batch_metadata_on_both_endpoints():
    db, job = database()
    now = datetime.now(timezone.utc)
    db.record_batch_details(job.id, {"status": "SUCCEEDED", "stoppedAt": 2000,
        "attempts": [{"container": {"logStreamName": "old-stream"}}]}, now)
    batch, logs = Mock(), Mock()
    batch.describe_jobs.return_value = {"jobs": []}
    logs.get_log_events.return_value = {"events": [{"message": "historical output"}]}
    with patch("cwms_batch_events.core.job_logger.cloudwatch.boto3.client", side_effect=[batch, logs]):
        logger = CloudWatchJobLogger(db)
    assert logger.get_log_page(job.id).logs == "historical output"
    assert logger.get_logs_for_job(job.id) == "historical output"
    batch.describe_jobs.assert_not_called()
    assert logs.get_log_events.call_args.kwargs["logGroupName"] == "ecs/cwms-batch/swt-jobs"


def test_late_callbacks_do_not_reopen_terminal_jobs_or_replace_stream():
    db, job = database()
    now = datetime.now(timezone.utc)
    done = {"status": "FAILED", "statusReason": "Container exited", "container": {"logStreamName": "final"}}
    db.record_batch_details(job.id, done, now)
    for when in (now - timedelta(seconds=1), now + timedelta(seconds=1)):
        db.record_batch_details(job.id, {"status": "RUNNING", "container": {"logStreamName": "stale"}}, when)
    assert job.job_status == "Failed"
    assert job.log_stream == "final"
    assert job.batch_status_reason == "Container exited"


def test_missing_metadata_reports_unavailable_and_is_throttled():
    db, job = database()
    batch, logs = Mock(), Mock()
    batch.describe_jobs.return_value = {"jobs": []}
    with patch("cwms_batch_events.core.job_logger.cloudwatch.boto3.client", side_effect=[batch, logs]):
        logger = CloudWatchJobLogger(db)
    for _ in range(3):
        page = logger.get_log_page(job.id)
        assert not page.available
        assert "expired" in page.message
    batch.describe_jobs.assert_called_once()
    logs.get_log_events.assert_not_called()


def test_batch_state_logs_only_changes_and_only_after_commit(caplog):
    import logging
    import pytest
    db, job = database()
    now = datetime.now(timezone.utc)
    with caplog.at_level(logging.INFO, logger="cwms_batch_events.core.job_database.postgres.postgres"):
        detail = {"status": "RUNNING", "container": {"logStreamName": "stream"}}
        db.record_batch_details(job.id, detail, now)
        db.record_batch_details(job.id, detail, now)
        db.db.commit.side_effect = RuntimeError("database failed")
        with pytest.raises(RuntimeError):
            db.record_batch_details(job.id, {"status": "SUCCEEDED"}, now)
    records = [r for r in caplog.records if getattr(r, "event", None) == "batch_state_updated"]
    assert len(records) == 1
    assert records[0].batch_status == "RUNNING"
    assert records[0].stream_available is True
