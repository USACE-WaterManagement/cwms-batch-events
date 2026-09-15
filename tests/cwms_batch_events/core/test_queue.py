from unittest import mock
from types import SimpleNamespace
from uuid import uuid4

from cwms_batch_events.core.models import JobSource, ScriptRunOptions
from cwms_batch_events.core.queue import JobQueue, MESSAGE_VERSION
from cwms_batch_events.core.logging_config import request_id


def test_job_queue_initializes_sqs_resource_and_queue():
    sqs = mock.Mock()
    queue_obj = mock.Mock()
    sqs.get_queue_by_name.return_value = queue_obj

    with mock.patch(
        "cwms_batch_events.core.queue.boto3.resource",
        return_value=sqs,
    ) as boto_resource, mock.patch(
        "cwms_batch_events.core.queue.settings.sqs_endpoint_url",
        "http://sqs",
    ), mock.patch(
        "cwms_batch_events.core.queue.settings.default_job_runner",
        "batch",
    ):
        queue = JobQueue()

    assert queue.queue is queue_obj
    assert queue.runner_type == "batch"
    boto_resource.assert_called_once_with("sqs", endpoint_url="http://sqs")
    sqs.get_queue_by_name.assert_called_once_with(QueueName="cwms-batch-events")


def test_create_job_message_uses_runner_type():
    queue = JobQueue.__new__(JobQueue)
    queue.runner_type = "docker-local"
    payload = ScriptRunOptions(office="swt", repo_path="run.py", script_slug="script")
    job_id = uuid4()

    token = request_id.set("a" * 32)
    try:
        message = queue.create_job_message(job_id, "tester", JobSource.API, payload)
    finally:
        request_id.reset(token)

    assert message.version == MESSAGE_VERSION
    assert message.job_id == job_id
    assert message.runner_type == "docker-local"
    assert message.requested_by.username == "tester"
    assert message.requested_by.source == JobSource.API
    assert message.payload == payload
    assert message.request_id == "a" * 32
    assert queue.create_job_message(job_id, "tester", JobSource.API, payload).request_id is None


def test_send_job_message_returns_message_id():
    queue = JobQueue.__new__(JobQueue)
    queue.runner_type = "docker-local"
    queue.queue = SimpleNamespace(
        send_message=lambda MessageBody: {"MessageId": "message-123"}
    )
    payload = ScriptRunOptions(office="swt", repo_path="run.py", script_slug="script")
    message = queue.create_job_message(uuid4(), "tester", JobSource.API, payload)

    response = queue.send_job_message(message)

    assert response == "message-123"
