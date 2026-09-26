import logging
from cwms_batch_events.core.execution import command_for_payload, skips_repository_checkout
from cwms_batch_events.core.models import JobMessage
from cwms_batch_events.core.models import RESOURCE_PROFILES
from cwms_batch_events.core.release_jars import jar_command
from cwms_batch_events.core.job_correlation import runner_environment
from cwms_batch_events.lambdas.dispatch_job.utils import OFFICES

import boto3
from datetime import datetime

logger = logging.getLogger(__name__)


class BatchJobRunner:
    def __init__(self, artifact_api_url=None, artifact_key=None):
        self.batch = boto3.client("batch")
        self.artifact_api_url = artifact_api_url
        self.artifact_key = artifact_key

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
        environment.append({"name": "TZ", "value": message.payload.schedule_timezone})
        environment.extend(
            {"name": item.name, "value": item.value}
            for item in message.payload.environment_variables
        )
        environment.extend({"name": name, "value": value} for name, value in runner_environment(message).items())
        tags = {"Office": office, "BatchEventsJobId": str(message.job_id)}
        if message.request_id:
            tags["BatchEventsRequestId"] = message.request_id
        if skips_repository_checkout(message.payload):
            environment.append({"name": "SKIP_GIT_CLONE", "value": "true"})

        command = command_for_payload(message.payload)
        if message.payload.release_jar:
            command = jar_command(message, self.artifact_api_url, self.artifact_key)
        response = self.batch.submit_job(
            jobName=job_name,
            jobQueue=f"cwms-{OFFICES[office]['division']}-jq",
            jobDefinition=f"cwms-{office}-jobs-jobdef",
            containerOverrides={
                "environment": environment,
                "command": command,
                "resourceRequirements": [
                    {"type": "VCPU", "value": RESOURCE_PROFILES[message.payload.resource_size]["vcpus"]},
                    {"type": "MEMORY", "value": RESOURCE_PROFILES[message.payload.resource_size]["memory"]},
                ],
            },
            tags=tags,
        )

        batch_job_id: str = response["jobId"]

        logger.info(
            "Batch job submitted", extra={"event": "batch_submitted", "job_id": message.job_id, "external_job_id": batch_job_id, "office": office},
        )

        return batch_job_id
