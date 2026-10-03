from unittest import mock

import pytest

from cwms_batch_events.core.models import (
    JobStatus,
)
from cwms_batch_events.local.executor import LocalExecutor
from tests.factories import make_job_message, make_job_record


def test_local_executor_marks_completed_job_and_persists_logs():
    db = mock.Mock()
    logger = mock.Mock()
    message = make_job_message(runner_type="docker-local")
    container = mock.Mock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = b"hello"
    client = mock.Mock()
    client.containers.run.return_value = container

    with mock.patch("docker.client.from_env", return_value=client):
        executor = LocalExecutor(db, logger)
        executor.run_job(message)

    assert db.update_job_status.call_args_list[0].args[1] == JobStatus.RUNNING
    assert db.update_job_status.call_args_list[-1].args[1] == JobStatus.COMPLETED
    logger.push_logs_for_job.assert_called_once_with(message.job_id, "hello")
    container.remove.assert_called_once_with()


def test_local_executor_marks_failed_job_on_nonzero_status():
    db = mock.Mock()
    logger = mock.Mock()
    notification_queue = mock.Mock()
    message = make_job_message(runner_type="docker-local")
    job = make_job_record(id=message.job_id)
    db.get_job_by_id.return_value = job
    container = mock.Mock()
    container.wait.return_value = {"StatusCode": 1}
    container.logs.return_value = b"hello"
    client = mock.Mock()
    client.containers.run.return_value = container

    with mock.patch("docker.client.from_env", return_value=client), mock.patch(
        "cwms_batch_events.local.executor.enqueue_failed_job_notifications"
    ) as enqueue_alerts:
        executor = LocalExecutor(db, logger, notification_queue)
        executor.run_job(message)

    assert db.update_job_status.call_args_list[-1].args[1] == JobStatus.FAILED
    enqueue_alerts.assert_called_once_with(
        job,
        db,
        notification_queue,
        error_message="Local job exited with status code 1",
        logs="hello",
    )


def test_local_executor_marks_failed_and_reraises_on_exception():
    db = mock.Mock()
    logger = mock.Mock()
    notification_queue = mock.Mock()
    message = make_job_message(runner_type="docker-local")
    job = make_job_record(id=message.job_id)
    db.get_job_by_id.return_value = job
    client = mock.Mock()
    client.containers.run.side_effect = RuntimeError("boom")

    with mock.patch("docker.client.from_env", return_value=client), mock.patch(
        "cwms_batch_events.local.executor.enqueue_failed_job_notifications"
    ) as enqueue_alerts:
        executor = LocalExecutor(db, logger, notification_queue)
        with pytest.raises(RuntimeError, match="boom"):
            executor.run_job(message)

    assert db.update_job_status.call_args_list[-1].args[1] == JobStatus.FAILED
    logger.push_logs_for_job.assert_called_once()
    assert logger.push_logs_for_job.call_args.args[0] == message.job_id
    assert "RuntimeError: boom" in logger.push_logs_for_job.call_args.args[1]
    alert_logs = enqueue_alerts.call_args.kwargs["logs"]
    assert "RuntimeError: boom" in alert_logs
    enqueue_alerts.assert_called_once_with(
        job,
        db,
        notification_queue,
        error_message="boom",
        logs=alert_logs,
    )
