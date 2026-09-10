import boto3
from uuid import UUID

from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import JobRecord


class CloudWatchJobLogger:
    def __init__(self, db: JobDatabase):
        self.batch = boto3.client("batch")
        self.db = db
        self.logs = boto3.client("logs")

    def get_job_details(self, job_id: UUID) -> JobRecord:
        job = self.db.get_job_by_id(job_id)

        if not job:
            raise ValueError(f"No job found for job_id {job_id}")

        return job

    def get_batch_log_name(self, external_job_id: str) -> str:
        response = self.batch.describe_jobs(jobs=[external_job_id])
        jobs = response.get("jobs", [])

        if not jobs:
            raise ValueError(
                f"No Batch jobs found for external_job_id {external_job_id}"
            )
        if len(jobs) > 1:
            raise ValueError(
                f"Multiple jobs found for external_job_id {external_job_id}"
            )

        attempts = jobs[0].get("attempts", [])
        if not attempts:
            raise ValueError(
                f"No Batch job attempts found for external_job_id {external_job_id}"
            )

        log_stream_name = attempts[-1].get("container", {}).get("logStreamName")
        if not log_stream_name:
            raise ValueError(
                f"No log stream found for external_job_id {external_job_id}"
            )

        return log_stream_name

    def get_logs_for_job(self, job_id: UUID) -> str:
        job = self.get_job_details(job_id)

        if not job.external_job_id:
            raise ValueError(f"No external_job_id found for job_id {job_id}")
        log_name = self.get_batch_log_name(job.external_job_id)

        log_group = f"ecs/cwms-batch/{job.office.lower()}-jobs"

        logs = self.logs.get_log_events(
            logGroupName=log_group,
            logStreamName=log_name,
            startFromHead=True,
        )

        logs_output: list[str] = []
        logs_output.extend(event["message"] for event in logs["events"])

        return "\n".join(logs_output)

    def push_logs_for_job(self, job_id: UUID, logs: str) -> None:
        raise NotImplementedError(
            "CloudWatch logger does not support manual posting of logs"
        )
