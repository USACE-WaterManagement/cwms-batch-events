import logging
from cwms_batch_events.core.execution import command_for_payload
from cwms_batch_events.core.models import JobMessage
from cwms_batch_events.lambdas.dispatch_job.utils import OFFICES

import boto3
from datetime import datetime

logger = logging.getLogger(__name__)


class BatchJobRunner:
    def __init__(self):
        self.batch = boto3.client("batch")

    def run_job(self, message: JobMessage):
        office = message.payload.office
        repo_path = message.payload.repo_path
        script_slug = message.payload.script_slug
        if script_slug is None:
            script_slug = repo_path.split("/")[-1]

        job_name = (
            f"cwms-{office}-event-{script_slug}-{datetime.now().strftime('%Y%m%d-%H%M')}"
        ).replace(".", "_")

        environment = [{"name": "OFFICE", "value": office}]
        if message.payload.execution_type == "command":
            environment.append({"name": "SKIP_GIT_CLONE", "value": "true"})

        response = self.batch.submit_job(
            jobName=job_name,
            jobQueue=f"cwms-{OFFICES[office]['division']}-jq",
            jobDefinition=f"cwms-{office}-jobs-jobdef",
            containerOverrides={
                "environment": environment,
                "command": command_for_payload(message.payload),
            },
            tags={
                "Office": office,
            },
        )

        batch_job_id: str = response["jobId"]

        logger.info(
            "Batch job submitted", extra={"event": "batch_submitted", "job_id": message.job_id, "external_job_id": batch_job_id, "office": office},
        )

        return batch_job_id
