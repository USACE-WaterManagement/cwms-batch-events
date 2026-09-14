import json
from unittest import mock

import pytest
from botocore.exceptions import ClientError

from cwms_batch_events.lambdas.dispatch_job.dispatcher import (
    MissingJobRunner,
    dispatch_job,
    get_internal_token,
    lambda_handler,
)
from tests.factories import make_job_message


def test_dispatch_job_uses_batch_runner():
    message = make_job_message()

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.BatchJobRunner"
    ) as runner_cls:
        runner_cls.return_value.run_job.return_value = "ext-123"

        external_job_id = dispatch_job(message)

    assert external_job_id == "ext-123"
    runner_cls.return_value.run_job.assert_called_once_with(message)


def test_dispatch_job_rejects_unknown_runner_type():
    message = make_job_message()
    message.runner_type = "unknown"

    with pytest.raises(MissingJobRunner):
        dispatch_job(message)


def test_get_internal_token_reads_and_caches_secret():
    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher._cached_internal_token", None
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.APP_SECRETS_ARN", "arn"
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.secrets_client"
    ) as secrets_client:
        secrets_client.get_secret_value.return_value = {
            "SecretString": json.dumps({"APP_KEY": "secret"})
        }

        first = get_internal_token()
        second = get_internal_token()

    assert first == "secret"
    assert second == "secret"
    secrets_client.get_secret_value.assert_called_once_with(SecretId="arn")


def test_get_internal_token_requires_secret_string():
    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher._cached_internal_token", None
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.secrets_client"
    ) as secrets_client:
        secrets_client.get_secret_value.return_value = {"SecretString": ""}

        with pytest.raises(RuntimeError, match="SecretString"):
            get_internal_token()


@pytest.mark.parametrize("document_scan", [False, True])
def test_lambda_handler_processes_messages_and_binds_external_job_id(document_scan):
    message = make_job_message()
    message.document_scan = document_scan
    response = mock.Mock(status_code=204, text="")

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.dispatch_job",
        return_value="ext-123",
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.requests.post",
        return_value=response,
    ) as requests_post, mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.API_BASE_URL",
        "http://events",
    ):
        lambda_handler({"Records": [{"body": message.model_dump_json()}]}, None)

    requests_post.assert_called_once()
    resource = "document/scan" if document_scan else "jobs"
    assert (
        requests_post.call_args.args[0]
        == f"http://events/internal/{resource}/{message.job_id}/external-job-id"
    )
    assert requests_post.call_args.kwargs["json"] == {"external_job_id": "ext-123"}


def test_lambda_handler_raises_when_api_rejects_message():
    message = make_job_message()
    response = mock.Mock(status_code=500, text="bad")

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.dispatch_job",
        return_value="ext-123",
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.requests.post",
        return_value=response,
    ):
        with pytest.raises(RuntimeError, match="Events API rejected message"):
            lambda_handler({"Records": [{"body": message.model_dump_json()}]}, None)


def test_lambda_handler_reraises_batch_submit_error():
    message = make_job_message()

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.dispatcher.dispatch_job",
        side_effect=ClientError(
            {"Error": {"Code": "Oops", "Message": "bad"}}, "Submit"
        ),
    ):
        with pytest.raises(ClientError):
            lambda_handler({"Records": [{"body": message.model_dump_json()}]}, None)
