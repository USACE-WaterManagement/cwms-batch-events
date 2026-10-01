"""
Lambda function: dispatch_job

This Lambda will receive messages from the events SQS queue through an event source
mapping. It submits the job to the appropriate runner and makes an API request to bind
the internal job record to the external_job_id provided by the runner.
"""

import json
import os

import boto3
from botocore.exceptions import ClientError
import requests
from pydantic import ValidationError
from cwms_batch_events.core.logging_config import configure_logging, bind_log_context
from cwms_batch_events.core.lambda_logging import lambda_logger, with_lambda_logging

from cwms_batch_events.lambdas.dispatch_job.job_runner.base import JobRunner
from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from cwms_batch_events.core.models import BindExternalJobIdRequest, JobMessage

configure_logging(service="cwms-batch-events-dispatcher")
logger = lambda_logger("cwms-batch-events-dispatcher")

API_BASE_URL = os.environ["ALB_DNS_NAME"] + "/api"
APP_SECRETS_ARN = os.environ["APP_SECRETS_ARN"]

secrets_client = boto3.client("secretsmanager")
_cached_internal_token: str | None = None


class MissingJobRunner(Exception):
    pass


def dispatch_job(message: JobMessage):
    runner: JobRunner | None = None
    if message.runner_type == "batch":
        if message.payload.release_jar:
            runner = BatchJobRunner(artifact_api_url=API_BASE_URL, artifact_key=get_internal_token())
        else:
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


@with_lambda_logging(logger)
def lambda_handler(event, context):
    internal_token = get_internal_token()

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": internal_token,
    }

    records = event.get("Records", [])
    logger.debug("Received SQS batch", extra={"event": "dispatch_received", "count": len(records)})

    failures = []
    for record in records:
        body_raw = record["body"]

        try:
            message = JobMessage.model_validate_json(body_raw)
        except (json.JSONDecodeError, ValidationError):
            logger.error("Invalid job queue message", extra={"event": "dispatch_invalid_message"})
            failures.append(ValueError("Invalid job queue message"))
            continue

        # Reset for each SQS record, including when dispatch raises.
        try:
            with bind_log_context(job_id=str(message.job_id), request_id=message.request_id):
                _dispatch_and_bind(message, headers)
        except Exception as exc:
            failures.append(exc)
    if failures:
        # Deployed mappings retry the whole SQS batch. Process every record so
        # one bad office cannot starve others; claims protect successful retries.
        raise failures[0]


def _dispatch_and_bind(message, headers):
    claim = requests.post(
        f"{API_BASE_URL}/internal/jobs/{message.job_id}/claim-dispatch",
        headers=headers, timeout=10,
    )
    claim.raise_for_status()
    outcome = claim.json()
    if not outcome["claimed"]:
        if outcome["external_job_id"] or outcome["status"] in ("Completed", "Failed", "Dispatch unknown"):
            logger.info("Job already dispatched or closed to dispatch", extra={"event": "dispatch_duplicate"})
            return
        # Another invocation may have submitted it before losing its API response.
        # Keep retrying the observation, never SubmitJob, until linked or timed out.
        raise RuntimeError("Dispatch already claimed; awaiting its outcome")
    logger.debug("Dispatching job", extra={"event": "job_dispatching"})
    try:
        external_job_id = dispatch_job(message)
    except ClientError as exc:
        logger.exception("Failed to submit Batch job", extra={"event": "job_dispatch_failed"})
        code = exc.response.get("Error", {}).get("Code")
        if exc.operation_name == "SubmitJob" and code in {
            "ClientException", "AccessDeniedException", "AccessDenied",
        }:
            # Only a definitive SubmitJob rejection is a proven dispatch failure.
            # Do not expose arbitrary AWS messages (which can contain commands).
            detail = exc.response.get("Error", {}).get("Message", "")
            if code == "ClientException" and "JobDefinition" in detail and (
                "does not exist" in detail or "ACTIVE" in detail
            ):
                reason = (f"Dispatch failed: no active AWS Batch job definition is available for "
                          f"office {message.payload.office.upper()}. Ask an administrator to configure it before submitting a new run.")
            else:
                reason = "Dispatch failed: AWS Batch rejected the submission. Ask an administrator to check the dispatcher logs and runner configuration."
            _record_failure(message, headers, reason)
            return
        raise
    except MissingJobRunner:
        _record_failure(message, headers, "Dispatch failed: the requested job runner is not supported.")
        return

    try:
        bind_request = BindExternalJobIdRequest(external_job_id=external_job_id)
        r = requests.post(
            f"{API_BASE_URL}/internal/jobs/{message.job_id}/external-job-id",
            headers=headers, json=bind_request.model_dump(), timeout=10,
        )
    except requests.RequestException:
        logger.exception("Failed to call events API")
        raise

    if not (200 <= r.status_code < 300):
        logger.error("Events API rejected job binding", extra={"event": "job_bind_failed", "status_code": r.status_code})
        raise RuntimeError("Events API rejected message")

    logger.info("Dispatched job and recorded Batch ID", extra={"event": "job_dispatched", "external_job_id": external_job_id})


def _record_failure(message, headers, reason):
    response = requests.post(
        f"{API_BASE_URL}/internal/jobs/{message.job_id}/dispatch-failure",
        headers=headers, json={"reason": reason}, timeout=10,
    )
    # Never acknowledge SQS until the API has committed the outcome.
    response.raise_for_status()
