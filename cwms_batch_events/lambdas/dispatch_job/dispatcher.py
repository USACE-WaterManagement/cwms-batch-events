"""
Lambda function: dispatch_job

This Lambda will receive messages from the events SQS queue through an event source
mapping. It submits the job to the appropriate runner and makes an API request to bind
the internal job record to the external_job_id provided by the runner.
"""

import json
import logging
import os

import boto3
from botocore.exceptions import ClientError
import requests
from pydantic import ValidationError
from cwms_batch_events.core.logging_config import configure_logging

from cwms_batch_events.lambdas.dispatch_job.job_runner.base import JobRunner
from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from cwms_batch_events.core.models import BindExternalJobIdRequest, JobMessage

configure_logging()
logger = logging.getLogger(__name__)

API_BASE_URL = os.environ["ALB_DNS_NAME"] + "/api"
APP_SECRETS_ARN = os.environ["APP_SECRETS_ARN"]

secrets_client = boto3.client("secretsmanager")
_cached_internal_token: str | None = None


class MissingJobRunner(Exception):
    pass


def dispatch_job(message: JobMessage):
    runner: JobRunner | None = None
    if message.runner_type == "batch":
        runner = BatchJobRunner()

    if not runner:
        raise MissingJobRunner(
            f"JobRunner for runner_type {message.runner_type} not found"
        )

    external_job_id = runner.run_job(message)
    return external_job_id


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


def lambda_handler(event, context):
    internal_token = get_internal_token()

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": internal_token,
    }

    records = event.get("Records", [])
    logger.debug("Received SQS batch", extra={"event": "dispatch_received", "count": len(records)})

    for record in records:
        body_raw = record["body"]

        try:
            message = JobMessage.model_validate_json(body_raw)
            logger.debug("Dispatching job", extra={"event": "job_dispatching", "job_id": message.job_id})
        except (json.JSONDecodeError, ValidationError):
            logger.error("Invalid job queue message", extra={"event": "dispatch_invalid_message"})
            raise ValueError("Invalid job queue message") from None

        try:
            external_job_id = dispatch_job(message)
        except ClientError:
            logger.exception("Failed to submit Batch job", extra={"event": "job_dispatch_failed", "job_id": message.job_id})
            raise

        try:
            bind_request = BindExternalJobIdRequest(external_job_id=external_job_id)
            r = requests.post(
                f"{API_BASE_URL}/internal/jobs/{message.job_id}/external-job-id",
                headers=headers,
                json=bind_request.model_dump(),
                timeout=10,
            )
        except requests.RequestException:
            logger.exception("Failed to call events API")
            raise

        if not (200 <= r.status_code < 300):
            logger.error(
                "Events API rejected job binding", extra={"event": "job_bind_failed", "job_id": message.job_id, "status_code": r.status_code},
            )
            raise RuntimeError("Events API rejected message")

        logger.info("Dispatched job and recorded Batch ID", extra={"event": "job_dispatched", "job_id": message.job_id, "external_job_id": external_job_id})
