from datetime import datetime
from uuid import UUID
import boto3
import logging

from cwms_batch_events.core.models import (
    JobMessage,
    JobRequestedBy,
    JobSource,
    ScriptRunOptions,
    ScriptRunRequest,
)
from cwms_batch_events.core.settings import RunnerSettings, get_settings

from cwms_batch_events.core.logging_config import request_id

settings = get_settings(RunnerSettings)

MESSAGE_VERSION = "1.0"
logger = logging.getLogger(__name__)


class JobQueue:
    def __init__(self):
        self.sqs = boto3.resource(
            "sqs",
            endpoint_url=settings.sqs_endpoint_url,
        )
        self.queue = self.sqs.get_queue_by_name(QueueName="cwms-batch-events")
        self.runner_type = settings.default_job_runner

    def create_job_message(
        self, job_id: UUID, username: str, source: JobSource, payload: ScriptRunOptions
    ):
        requested_by = JobRequestedBy(username=username, source=source)
        return JobMessage(
            version=MESSAGE_VERSION,
            job_id=job_id,
            runner_type=self.runner_type,
            requested_by=requested_by,
            created_at=datetime.now(),
            payload=payload,
            request_id=request_id.get(),
        )

    def send_job_message(self, message: JobMessage) -> str:
        try:
            response = self.queue.send_message(MessageBody=message.model_dump_json())
        except Exception:
            logger.exception("Failed to enqueue job", extra={"event": "job_enqueue_failed", "job_id": message.job_id})
            raise
        logger.info("Job queued", extra={"event": "job_queued", "job_id": message.job_id})
        return response["MessageId"]
