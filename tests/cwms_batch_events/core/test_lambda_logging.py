import io
import json
import logging
from uuid import uuid4

import pytest
from aws_lambda_powertools import Logger

from cwms_batch_events.core.lambda_logging import SafeLambdaFormatter, with_lambda_logging
from cwms_batch_events.core.logging_config import bind_log_context, log_context
from cwms_batch_events.core.job_correlation import runner_environment, correlation_from_batch
from tests.factories import make_job_message, make_lambda_context


def test_powertools_context_is_scoped_and_errors_do_not_expose_payloads(monkeypatch):
    monkeypatch.setenv("POWERTOOLS_LOGGER_LOG_EVENT", "true")
    stream = io.StringIO()
    service = "test-" + uuid4().hex
    logger = Logger(service=service, stream=stream, logger_formatter=SafeLambdaFormatter(service))

    @with_lambda_logging(logger)
    def handler(event, context):
        logger.info("Invocation started")
        for job in event["jobs"]:
            with bind_log_context(job_id=job, request_id="a" * 32):
                logger.info("Job started")
                try:
                    raise ValueError("secret-payload")
                except ValueError:
                    logger.exception("Job failed")
        if event.get("fail"):
            raise RuntimeError("failure")

    context = make_lambda_context()
    handler({"jobs": ["first", "second"], "secret": "secret-payload"}, context)
    context.aws_request_id = "next-invocation"
    with pytest.raises(RuntimeError):
        handler({"jobs": [], "fail": True}, context)
    entries = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert "secret-payload" not in stream.getvalue()
    assert [e.get("job_id") for e in entries] == [None, "first", "first", "second", "second", None]
    assert entries[-1]["function_request_id"] == "next-invocation"
    assert entries[-1]["cold_start"] is False
    assert entries[1]["correlation_id"] == "first"
    assert entries[1]["request_id"] == "a" * 32
    assert entries[2]["level"] == "ERROR"
    assert entries[2]["error_type"] == "ValueError"
    assert entries[2]["stack"][0]["function"] == "handler"
    assert all(e["service"] == service and e["environment"] and e["version"] for e in entries)
    assert log_context.get() == {}
    logging.getLogger(service).handlers.clear()


def test_runner_environment_and_batch_event_correlation():
    message = make_job_message(request_id="b" * 32)
    environment = runner_environment(message)
    assert environment["BATCH_EVENTS_JOB_ID"] == str(message.job_id)
    assert environment["BATCH_EVENTS_CORRELATION_ID"] == str(message.job_id)
    assert environment["BATCH_EVENTS_REQUEST_ID"] == "b" * 32
    assert "BATCH_EVENTS_REQUEST_ID" not in runner_environment(make_job_message())
    fields = correlation_from_batch({"jobId": "aws-job", "tags": {
        "BatchEventsJobId": str(message.job_id), "BatchEventsRequestId": "b" * 32,
    }})
    assert fields == {"external_job_id": "aws-job", "job_id": str(message.job_id), "request_id": "b" * 32}
    assert correlation_from_batch({"jobId": "old-job", "tags": {"BatchEventsJobId": "bad", "BatchEventsRequestId": "secret"}}) == {"external_job_id": "old-job"}
