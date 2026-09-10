from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError

from cwms_batch_events.core.job_logger.cloudwatch import CloudWatchJobLogger
from cwms_batch_events.core.job_logger.s3 import S3JobLogger


def test_s3_job_logger_reads_logs_from_bucket():
    body = mock.Mock()
    body.read.return_value = b"hello"
    s3_client = mock.Mock()
    s3_client.get_object.return_value = {"Body": body}

    with mock.patch(
        "cwms_batch_events.core.job_logger.s3.boto3.client",
        return_value=s3_client,
    ), mock.patch("cwms_batch_events.core.job_logger.s3.S3_BUCKET", "bucket"):
        logger = S3JobLogger()
        logs = logger.get_logs_for_job(uuid4())

    assert logs == "hello"


def test_s3_job_logger_reports_missing_logs():
    job_id = uuid4()
    s3_client = mock.Mock()
    s3_client.get_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "not found"}},
        "GetObject",
    )

    with mock.patch(
        "cwms_batch_events.core.job_logger.s3.boto3.client",
        return_value=s3_client,
    ), mock.patch("cwms_batch_events.core.job_logger.s3.S3_BUCKET", "bucket"):
        logger = S3JobLogger()

    with pytest.raises(FileNotFoundError, match=f"No logs found for job {job_id}"):
        logger.get_logs_for_job(job_id)


def test_s3_job_logger_pushes_logs_to_bucket():
    s3_client = mock.Mock()
    job_id = uuid4()

    with mock.patch(
        "cwms_batch_events.core.job_logger.s3.boto3.client",
        return_value=s3_client,
    ), mock.patch("cwms_batch_events.core.job_logger.s3.S3_BUCKET", "bucket"):
        logger = S3JobLogger()
        logger.push_logs_for_job(job_id, "hello")

    s3_client.put_object.assert_called_once_with(
        Bucket="bucket",
        Key=f"logs/{job_id}.log",
        Body=b"hello",
    )


def test_cloudwatch_job_logger_get_job_details_requires_existing_job():
    db = mock.Mock()
    db.get_job_by_id.return_value = None

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[mock.Mock(), mock.Mock()],
    ):
        logger = CloudWatchJobLogger(db)

    with pytest.raises(ValueError, match="No job found"):
        logger.get_job_details(uuid4())


def test_cloudwatch_job_logger_requires_single_batch_job_match():
    batch_client = mock.Mock()
    batch_client.describe_jobs.return_value = {"jobs": []}

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[batch_client, mock.Mock()],
    ):
        logger = CloudWatchJobLogger(mock.Mock())

    with pytest.raises(ValueError, match="No Batch jobs found"):
        logger.get_batch_log_name("ext-123")


def test_cloudwatch_job_logger_rejects_multiple_batch_jobs():
    batch_client = mock.Mock()
    batch_client.describe_jobs.return_value = {"jobs": [{}, {}]}

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[batch_client, mock.Mock()],
    ):
        logger = CloudWatchJobLogger(mock.Mock())

    with pytest.raises(ValueError, match="Multiple jobs found"):
        logger.get_batch_log_name("ext-123")


def test_cloudwatch_job_logger_reports_missing_batch_attempts():
    batch_client = mock.Mock()
    batch_client.describe_jobs.return_value = {"jobs": [{"attempts": []}]}

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[batch_client, mock.Mock()],
    ):
        logger = CloudWatchJobLogger(mock.Mock())

    with pytest.raises(ValueError, match="No Batch job attempts found"):
        logger.get_batch_log_name("ext-123")


def test_cloudwatch_job_logger_reports_missing_log_stream():
    batch_client = mock.Mock()
    batch_client.describe_jobs.return_value = {
        "jobs": [{"attempts": [{"container": {}}]}]
    }

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[batch_client, mock.Mock()],
    ):
        logger = CloudWatchJobLogger(mock.Mock())

    with pytest.raises(ValueError, match="No log stream found"):
        logger.get_batch_log_name("ext-123")


def test_cloudwatch_job_logger_requires_external_job_id():
    job_id = uuid4()
    db = mock.Mock()
    db.get_job_by_id.return_value = SimpleNamespace(
        external_job_id=None,
        office="SWT",
    )

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[mock.Mock(), mock.Mock()],
    ):
        logger = CloudWatchJobLogger(db)

    with pytest.raises(ValueError, match="No external_job_id found"):
        logger.get_logs_for_job(job_id)


def test_cloudwatch_job_logger_returns_joined_log_messages():
    job_id = uuid4()
    db = mock.Mock()
    db.get_job_by_id.return_value = SimpleNamespace(
        external_job_id="ext-123",
        office="SWT",
    )
    batch_client = mock.Mock()
    batch_client.describe_jobs.return_value = {
        "jobs": [{"attempts": [{"container": {"logStreamName": "stream"}}]}]
    }
    logs_client = mock.Mock()
    logs_client.get_log_events.return_value = {
        "events": [{"message": "line 1"}, {"message": "line 2"}]
    }

    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[batch_client, logs_client],
    ):
        logger = CloudWatchJobLogger(db)
        logs = logger.get_logs_for_job(job_id)

    assert logs == "line 1\nline 2"
    logs_client.get_log_events.assert_called_once_with(
        logGroupName="ecs/cwms-batch/swt-jobs",
        logStreamName="stream",
        startFromHead=True,
    )


def test_cloudwatch_job_logger_push_logs_not_supported():
    with mock.patch(
        "cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
        side_effect=[mock.Mock(), mock.Mock()],
    ):
        logger = CloudWatchJobLogger(mock.Mock())

    with pytest.raises(NotImplementedError):
        logger.push_logs_for_job(uuid4(), "logs")
