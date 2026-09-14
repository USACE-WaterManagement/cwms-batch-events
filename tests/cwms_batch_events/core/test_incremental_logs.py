import base64
import json
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError

from cwms_batch_events.core.job_logger.cloudwatch import CloudWatchJobLogger
from cwms_batch_events.core.job_logger.s3 import S3JobLogger


@pytest.fixture
def source():
    job_id = uuid4()
    db, batch, logs = Mock(), Mock(), Mock()
    db.get_job_by_id.return_value = SimpleNamespace(external_job_id="batch-id", office="SWT")
    batch.describe_jobs.return_value = {"jobs": [{"container": {"logStreamName": "active"}}]}
    with patch("cwms_batch_events.core.job_logger.cloudwatch.boto3.client", side_effect=[batch, logs]):
        logger = CloudWatchJobLogger(db)
    return logger, job_id, batch, logs


def test_pages_follow_tokens_through_empty_pages_and_do_not_repeat_output(source):
    logger, job_id, batch, logs = source
    logs.get_log_events.side_effect = [
        {"events": [{"message": "first"}], "nextForwardToken": "a"},
        {"events": [], "nextForwardToken": "b"},
        {"events": [{"message": "second"}], "nextForwardToken": "c"},
        {"events": [{"message": "third"}], "nextForwardToken": "d"},
        {"events": [], "nextForwardToken": "d"},
        {"events": [], "nextForwardToken": "d"},
    ]
    first = logger.get_log_page(job_id)
    assert first.logs == "first\nsecond"
    assert first.has_more
    assert logs.get_log_events.call_count == 3
    second = logger.get_log_page(job_id, first.next_cursor)
    assert second.logs == "third"
    assert not second.has_more
    assert logs.get_log_events.call_args_list[3].kwargs["nextToken"] == "c"
    assert logger.get_log_page(job_id, second.next_cursor).logs == ""
    assert batch.describe_jobs.call_count == 3


@pytest.mark.parametrize("detail", [
    {"container": {"logStreamName": "active"}},
    {"ecsProperties": {"taskProperties": [{"containers": [{"logStreamName": "active"}]}]}},
    {"attempts": [{"container": {"logStreamName": "active"}}]},
    {"attempts": [{"taskProperties": [{"containers": [{"logStreamName": "active"}]}]}]},
])
def test_current_and_completed_stream_shapes(source, detail):
    logger, _, batch, _ = source
    batch.describe_jobs.return_value = {"jobs": [detail]}
    assert logger.get_batch_log_name("batch-id") == "active"


def test_retry_attempt_and_expired_cursor_reset_from_head(source):
    logger, job_id, batch, logs = source
    logs.get_log_events.return_value = {"events": [], "nextForwardToken": "a"}
    first = logger.get_log_page(job_id)
    batch.describe_jobs.return_value = {"jobs": [{"container": {"logStreamName": "retry"}}]}
    logs.reset_mock()
    second = logger.get_log_page(job_id, first.next_cursor)
    assert second.reset
    assert "nextToken" not in logs.get_log_events.call_args_list[0].kwargs
    payload = json.loads(base64.urlsafe_b64decode(second.next_cursor))
    payload["issued"] = 0
    expired = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    assert logger.get_log_page(job_id, expired).reset


@pytest.mark.parametrize("cursor", ["!", "W10=", "e30=", "bnVsbA=="])
def test_invalid_cursor_rejected_before_aws(source, cursor):
    logger, job_id, batch, logs = source
    with pytest.raises(ValueError, match="Invalid log cursor"):
        logger.get_log_page(job_id, cursor)
    batch.describe_jobs.assert_not_called()
    logs.get_log_events.assert_not_called()


def test_cursor_cannot_be_used_for_another_job(source):
    logger, job_id, _, logs = source
    logs.get_log_events.return_value = {"events": [], "nextForwardToken": "a"}
    cursor = logger.get_log_page(job_id).next_cursor
    with pytest.raises(ValueError):
        logger.get_log_page(uuid4(), cursor)


def test_uncreated_stream_is_waiting_not_an_error(source):
    logger, job_id, batch, logs = source
    batch.describe_jobs.return_value = {"jobs": [{"attempts": []}]}
    assert not logger.get_log_page(job_id).available
    logs.get_log_events.assert_not_called()
    batch.describe_jobs.return_value = {"jobs": [{"container": {"logStreamName": "active"}}]}
    logs.get_log_events.side_effect = ClientError({"Error": {"Code": "ResourceNotFoundException"}}, "GetLogEvents")
    assert not logger.get_log_page(job_id).available


def test_cloudwatch_permissions_errors_are_not_silenced(source):
    logger, job_id, _, logs = source
    logs.get_log_events.side_effect = ClientError({"Error": {"Code": "AccessDeniedException"}}, "GetLogEvents")
    with pytest.raises(ClientError):
        logger.get_log_page(job_id)


def test_local_executor_reports_completion_only_logs():
    with patch("cwms_batch_events.core.job_logger.s3.boto3.client"):
        logger = S3JobLogger()
    with patch.object(logger, "get_logs_for_job", side_effect=FileNotFoundError):
        page = logger.get_log_page(uuid4())
        assert not page.available
        assert not page.supports_live
    with patch.object(logger, "get_logs_for_job", return_value="complete output"):
        page = logger.get_log_page(uuid4())
        assert page.logs == "complete output"
        assert page.reset
        assert not page.supports_live
