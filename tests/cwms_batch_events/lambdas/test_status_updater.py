from tests.factories import make_lambda_context
import json
from unittest import mock

import pytest
import requests
from botocore.exceptions import ClientError

from cwms_batch_events.lambdas.update_batch_job_status.status_updater import (
    get_internal_token,
    lambda_handler,
)


def test_get_internal_token_reads_and_caches_secret():
    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater._cached_internal_token",
        None,
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.APP_SECRETS_ARN",
        "arn",
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.secrets_client"
    ) as secrets_client:
        secrets_client.get_secret_value.return_value = {
            "SecretString": json.dumps({"APP_KEY": "secret"})
        }

        first = get_internal_token()
        second = get_internal_token()

    assert first == "secret"
    assert second == "secret"
    secrets_client.get_secret_value.assert_called_once_with(SecretId="arn")


def test_get_internal_token_re_raises_client_error():
    error = ClientError({"Error": {"Code": "Oops", "Message": "bad"}}, "GetSecretValue")

    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater._cached_internal_token",
        None,
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.secrets_client"
    ) as secrets_client:
        secrets_client.get_secret_value.side_effect = error

        with pytest.raises(ClientError):
            get_internal_token()


def test_lambda_handler_ignores_non_event_jobs():
    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.requests.post"
    ) as requests_post:
        lambda_handler(
            {
                "detail": {
                    "jobName": "cwms-swt-manual-script",
                    "jobId": "batch-123",
                    "status": "RUNNING",
                },
                "time": "2026-04-16T12:00:00Z",
            },
            make_lambda_context(),
        )

    requests_post.assert_not_called()


def test_lambda_handler_ignores_unsupported_status():
    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.requests.post"
    ) as requests_post:
        lambda_handler(
            {
                "detail": {
                    "jobName": "cwms-swt-event-script",
                    "jobId": "batch-123",
                    "status": "UNKNOWN",
                },
                "time": "2026-04-16T12:00:00Z",
            },
            make_lambda_context(),
        )

    requests_post.assert_not_called()


def test_lambda_handler_posts_translated_status_to_events_api():
    response = mock.Mock(status_code=204, text="")

    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.requests.post",
        return_value=response,
    ) as requests_post, mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.API_BASE_URL",
        "http://events/api",
    ):
        lambda_handler(
            {
                "detail": {
                    "jobName": "cwms-swt-event-script",
                    "jobId": "batch-123",
                    "status": "SUCCEEDED",
                },
                "time": "2026-04-16T12:00:00Z",
            },
            make_lambda_context(),
        )

    requests_post.assert_called_once()
    assert requests_post.call_args.kwargs["json"] == {
        "status": "Completed",
        "event_time": "2026-04-16T12:00:00Z",
        "batch_detail": {"status": "SUCCEEDED"},
    }


def test_lambda_handler_re_raises_request_exceptions():
    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.requests.post",
        side_effect=requests.RequestException("boom"),
    ):
        with pytest.raises(requests.RequestException):
            lambda_handler(
                {
                    "detail": {
                        "jobName": "cwms-swt-event-script",
                        "jobId": "batch-123",
                        "status": "RUNNING",
                    },
                    "time": "2026-04-16T12:00:00Z",
                },
                make_lambda_context(),
            )


@pytest.mark.parametrize("raw_status", ["SUBMITTED", "PENDING", "RUNNABLE", "STARTING"])
def test_pending_states_preserve_reason_and_only_log_reference(raw_status):
    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.requests.post",
        return_value=mock.Mock(status_code=204),
    ) as post:
        lambda_handler({"time": "2026-09-14T12:00:00Z", "detail": {
            "jobName": "cwms-swt-event-hourly", "jobId": "batch-id", "status": raw_status,
            "statusReason": "Waiting for capacity", "container": {
                "logStreamName": "retained", "environment": [{"name": "SECRET", "value": "not-forwarded"}],
            },
        }}, make_lambda_context())
    assert post.call_args.kwargs["json"] == {
        "status": "Pending", "event_time": "2026-09-14T12:00:00Z",
        "batch_detail": {"status": raw_status, "statusReason": "Waiting for capacity",
                         "container": {"logStreamName": "retained"}},
    }


def test_lambda_handler_raises_when_events_api_rejects_message():
    response = mock.Mock(status_code=500, text="bad")

    with mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.get_internal_token",
        return_value="secret",
    ), mock.patch(
        "cwms_batch_events.lambdas.update_batch_job_status.status_updater.requests.post",
        return_value=response,
    ):
        with pytest.raises(RuntimeError, match="Events API rejected message"):
            lambda_handler(
                {
                    "detail": {
                        "jobName": "cwms-swt-event-script",
                        "jobId": "batch-123",
                        "status": "RUNNING",
                    },
                    "time": "2026-04-16T12:00:00Z",
                },
                make_lambda_context(),
            )
