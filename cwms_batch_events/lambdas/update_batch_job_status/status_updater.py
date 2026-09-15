"""
Lambda function: update_batch_job_status

This Lambda will receive Batch job state change events through EventBridge and submit
them to the events API status update endpoint.
"""

import json
import os

import boto3
from botocore.exceptions import ClientError
import requests
from cwms_batch_events.core.batch_details import STATUS_MAP, log_stream
from cwms_batch_events.core.logging_config import configure_logging, bind_log_context
from cwms_batch_events.core.lambda_logging import lambda_logger, with_lambda_logging
from cwms_batch_events.core.job_correlation import correlation_from_batch

configure_logging(service="cwms-batch-events-status-updater")
logger = lambda_logger("cwms-batch-events-status-updater")

API_BASE_URL = os.environ["ALB_DNS_NAME"] + "/api"
APP_SECRETS_ARN = os.environ["APP_SECRETS_ARN"]


secrets_client = boto3.client("secretsmanager")
_cached_internal_token: str | None = None


def get_internal_token() -> str:
    global _cached_internal_token

    if _cached_internal_token:
        return _cached_internal_token

    try:
        resp = secrets_client.get_secret_value(SecretId=APP_SECRETS_ARN)
    except ClientError:
        logger.exception("Failed to retrieve app secrets from Secrets Manager")
        raise

    secret_string = resp.get("SecretString")
    if not secret_string:
        raise RuntimeError("App secrets 'SecretString' is empty")

    try:
        secret_obj = json.loads(secret_string)
        _cached_internal_token = secret_obj["APP_KEY"]
    except (json.JSONDecodeError, KeyError):
        logger.exception("App secrets do not contain APP_KEY")
        raise

    if not _cached_internal_token:
        raise RuntimeError("APP_KEY is not set")

    return _cached_internal_token


@with_lambda_logging(logger)
def lambda_handler(event, context):
    with bind_log_context(**correlation_from_batch(event.get("detail", {}))):
        return _forward_status(event)


def _forward_status(event):
    logger.debug("Received Batch job state change event from EventBridge")

    try:
        detail = event["detail"]
        job_name: str = detail["jobName"]
        batch_job_id = detail["jobId"]
        raw_status = detail["status"]
        time_iso = event["time"]
    except KeyError:
        logger.error("Unexpected format -- could not parse job state change event")
        raise

    if "-event-" not in job_name:
        logger.debug("Skipping non-event job status change")
        return

    try:
        status = STATUS_MAP[raw_status]
    except KeyError:
        logger.debug("Ignoring unsupported Batch status")
        return

    internal_token = get_internal_token()

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": internal_token,
    }

    # Preserve the stream from the event itself; no additional AWS permissions.
    payload = {"status": status, "event_time": time_iso, "batch_detail": {
        key: detail[key] for key in (
            "status", "statusReason", "startedAt", "stoppedAt",
        ) if key in detail
    }}
    if stream := log_stream(detail):
        payload["batch_detail"]["container"] = {"logStreamName": stream}
    try:
        r = requests.post(
            f"{API_BASE_URL}/internal/batch-jobs/{batch_job_id}/status",
            headers=headers,
            json=payload,
            timeout=10,
        )
    except requests.RequestException:
        logger.exception("Failed to call events API")
        raise

    if not (200 <= r.status_code < 300):
        logger.error(
            "Events API rejected status update", extra={"event": "status_callback_failed", "external_job_id": batch_job_id, "status_code": r.status_code},
        )
        raise RuntimeError("Events API rejected message")

    logger.info("Batch status forwarded to API", extra={"event": "status_callback_sent", "external_job_id": batch_job_id, "batch_status": raw_status})
