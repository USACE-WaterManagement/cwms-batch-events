from unittest import mock

from botocore.exceptions import ClientError

from cwms_batch_events.api import dependencies


def test_get_db_session_closes_session():
    session = mock.Mock()

    with mock.patch(
        "cwms_batch_events.api.dependencies.create_session",
        return_value=session,
    ):
        generator = dependencies.get_db_session()
        yielded = next(generator)

        assert yielded is session

        try:
            next(generator)
        except StopIteration:
            pass

    session.close.assert_called_once()


def test_get_job_database_wraps_session_in_postgres_job_database():
    session = object()

    with mock.patch(
        "cwms_batch_events.api.dependencies.PostgresJobDatabase",
        return_value="db",
    ) as postgres_db:
        db = dependencies.get_job_database(session)

    assert db == "db"
    postgres_db.assert_called_once_with(db=session)


def test_get_job_logger_uses_s3_for_local_runner():
    with mock.patch(
        "cwms_batch_events.api.dependencies.settings.default_job_runner", "docker-local"
    ), mock.patch(
        "cwms_batch_events.api.dependencies.S3JobLogger",
        return_value="logger",
    ) as s3_logger:
        logger = dependencies.get_job_logger(mock.Mock())

    assert logger == "logger"
    s3_logger.assert_called_once_with()


def test_get_job_logger_uses_cloudwatch_for_batch_runner():
    db = mock.Mock()

    with mock.patch(
        "cwms_batch_events.api.dependencies.settings.default_job_runner", "batch"
    ), mock.patch(
        "cwms_batch_events.api.dependencies.CloudWatchJobLogger",
        return_value="logger",
    ) as cloudwatch_logger:
        logger = dependencies.get_job_logger(db)

    assert logger == "logger"
    cloudwatch_logger.assert_called_once_with(db)


def test_get_job_queue_constructs_job_queue():
    with mock.patch(
        "cwms_batch_events.api.dependencies.JobQueue",
        return_value="queue",
    ) as job_queue_cls:
        queue = dependencies.get_job_queue()

    assert queue == "queue"
    job_queue_cls.assert_called_once_with()


def test_get_notification_queue_constructs_notification_queue():
    with mock.patch(
        "cwms_batch_events.api.dependencies.NotificationQueue",
        return_value="queue",
    ) as notification_queue_cls:
        queue = dependencies.get_notification_queue()

    assert queue == "queue"
    notification_queue_cls.assert_called_once_with()


def test_get_notification_queue_allows_status_updates_when_queue_is_missing():
    error = ClientError(
        {"Error": {"Code": "AWS.SimpleQueueService.NonExistentQueue"}},
        "GetQueueUrl",
    )
    with mock.patch(
        "cwms_batch_events.api.dependencies.NotificationQueue",
        side_effect=error,
    ):
        queue = dependencies.get_notification_queue()

    assert queue is None
