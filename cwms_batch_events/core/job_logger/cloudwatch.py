import base64
import json
import time

import boto3
from botocore.exceptions import ClientError
from uuid import UUID

from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import JobLogPage, JobRecord


class LogsNotReady(ValueError):
    pass


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
            raise LogsNotReady(
                f"No Batch jobs found for external_job_id {external_job_id}"
            )
        if len(jobs) > 1:
            raise ValueError(
                f"Multiple jobs found for external_job_id {external_job_id}"
            )

        job = jobs[0]
        # RUNNING jobs can expose their stream before an attempt is recorded.
        log_stream_name = self._container_stream(job)
        if log_stream_name:
            return log_stream_name
        attempts = job.get("attempts", [])
        if not attempts:
            raise LogsNotReady(
                f"No Batch job attempts found for external_job_id {external_job_id}"
            )

        log_stream_name = self._container_stream(attempts[-1])
        if not log_stream_name:
            raise LogsNotReady(
                f"No log stream found for external_job_id {external_job_id}"
            )

        return log_stream_name

    @staticmethod
    def _container_stream(detail: dict) -> str | None:
        stream = detail.get("container", {}).get("logStreamName")
        if stream:
            return stream
        # ECS properties jobs put containers under taskProperties.
        properties = detail.get("ecsProperties", detail)
        for task in properties.get("taskProperties", []):
            for container in task.get("containers", []):
                if container.get("logStreamName"):
                    return container["logStreamName"]
        return None

    def get_log_page(self, job_id: UUID, cursor: str | None = None) -> JobLogPage:
        previous = None
        if cursor:
            try:
                previous = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
                if (
                    not isinstance(previous, dict)
                    or previous.get("job") != str(job_id)
                    or not isinstance(previous.get("stream"), str)
                    or not isinstance(previous.get("token"), str)
                    or not isinstance(previous.get("issued"), (int, float))
                ):
                    raise ValueError("Invalid log cursor")
            except (ValueError, TypeError, UnicodeError) as exc:
                raise ValueError("Invalid log cursor") from exc

        job = self.get_job_details(job_id)
        if not job.external_job_id:
            return JobLogPage(logs="", available=False, next_cursor=cursor)
        try:
            stream = self.get_batch_log_name(job.external_job_id)
        except LogsNotReady:
            return JobLogPage(logs="", available=False, next_cursor=cursor)

        # Resolve stream from Batch every time; a client cannot select another
        # job's stream. Start over on a new attempt or before a token expires.
        reset = bool(previous and (
            previous["stream"] != stream or time.time() - previous["issued"] >= 23 * 3600
        ))
        token = previous["token"] if previous and not reset else None
        messages = []
        has_more = False
        try:
            # Bound both AWS requests and response size (up to three 1 MB pages).
            for _ in range(3):
                args = dict(
                    logGroupName=f"ecs/cwms-batch/{job.office.lower()}-jobs",
                    logStreamName=stream,
                    startFromHead=True,
                )
                if token:
                    args["nextToken"] = token
                page = self.logs.get_log_events(**args)
                messages.extend(event["message"] for event in page["events"])
                next_token = page.get("nextForwardToken")
                has_more = bool(next_token and next_token != token)
                token = next_token
                if not has_more:
                    break
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
                return JobLogPage(logs="", available=False, next_cursor=cursor)
            if token and exc.response.get("Error", {}).get("Code") == "InvalidParameterException":
                raise ValueError("Invalid log cursor") from exc
            raise
        next_cursor = None
        if token:
            next_cursor = base64.urlsafe_b64encode(json.dumps({
                "job": str(job_id), "stream": stream, "token": token, "issued": time.time(),
            }).encode()).decode()
        return JobLogPage(
            logs="\n".join(messages), next_cursor=next_cursor,
            has_more=has_more, reset=reset,
        )

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
