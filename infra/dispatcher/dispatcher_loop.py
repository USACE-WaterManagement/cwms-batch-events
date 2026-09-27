import boto3
import json
import logging
from pydantic import ValidationError
from cwms_batch_events.core.settings import DispatcherSettings, get_settings

# The dispatcher has no API authentication dependency.
settings = get_settings(DispatcherSettings)

from cwms_batch_events.core.logging_config import configure_logging

from cwms_batch_events.core.job_database.postgres import session
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.job_logger.s3 import S3JobLogger
from cwms_batch_events.core.models import JobMessage
from cwms_batch_events.local.dispatcher import LocalJobDispatcher

configure_logging(service="cwms-batch-events-local-dispatcher")
logger = logging.getLogger("cwms_batch_events.local.dispatcher_loop")

logger.info("Starting the local job dispatcher (lambda mock)...")

sqs = boto3.client(
    "sqs",
    endpoint_url="http://elasticmq:9324",
    region_name="us-gov-west-1",
    aws_access_key_id="x",
    aws_secret_access_key="x",
)

QUEUE_URL = settings.queue_url

job_logger = S3JobLogger()

while True:
    logger.debug("Waiting for job queue messages")
    resp = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=20,
    )

    for msg in resp.get("Messages", []):
        body_raw = msg["Body"]

        try:
            message = JobMessage.model_validate_json(body_raw)
            logger.debug("Dispatching local job", extra={"event": "job_dispatching", "job_id": message.job_id})
        except (json.JSONDecodeError, ValidationError):
            logger.error("Invalid job queue message", extra={"event": "dispatch_invalid_message"})
            raise ValueError("Invalid job queue message") from None

        try:
            db_session = session.create_session()
            db = PostgresJobDatabase(db=db_session)
            dispatcher = LocalJobDispatcher(db, job_logger)
            dispatcher.dispatch_job(message)

            sqs.delete_message(
                QueueUrl=QUEUE_URL,
                ReceiptHandle=msg["ReceiptHandle"],
            )

        finally:
            db_session.close()
