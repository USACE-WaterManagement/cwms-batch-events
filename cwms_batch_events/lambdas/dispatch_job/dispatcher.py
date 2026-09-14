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

from cwms_batch_events.lambdas.dispatch_job.job_runner.base import JobRunner
from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from cwms_batch_events.core.models import BindExternalJobIdRequest, JobMessage

logger = logging.getLogger()
logger.setLevel(logging.INFO)

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
    logger.info("Received %d SQS messages", len(records))

    for record in records:
        body_raw = record["body"]

        try:
            message = JobMessage.model_validate_json(body_raw)
            logger.info("Processing message: %s", message)
        except json.JSONDecodeError:
            logger.error("Invalid JSON in SQS message body: %s", body_raw)
            raise

        try:
            external_job_id = dispatch_job(message)
        except ClientError:
            logger.exception("Failed to submit batch job for message: %s", message)
            raise

        try:
            bind_request = BindExternalJobIdRequest(external_job_id=external_job_id)
            resource = "document/scan" if message.document_scan else "jobs"
            r = requests.post(
                f"{API_BASE_URL}/internal/{resource}/{message.job_id}/external-job-id",
                headers=headers,
                json=bind_request.model_dump(),
                timeout=10,
            )
        except requests.RequestException:
            logger.exception("Failed to call events API")
            raise

        if not (200 <= r.status_code < 300):
            logger.error(
                "Events API rejected message: %s %s",
                r.status_code,
                r.text,
            )
            raise RuntimeError("Events API rejected message")

    logger.info("Successfully processed all messages")
