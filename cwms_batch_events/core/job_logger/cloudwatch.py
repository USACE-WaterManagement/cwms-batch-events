import base64
import json
import time
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from uuid import UUID

from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import JobLogPage, JobRecord
from cwms_batch_events.core.batch_details import container_stream
from cwms_batch_events.core.log_diagnostics import log_timing


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

    def refresh_job(self, job_id: UUID) -> JobRecord:
        started = time.monotonic()
        job = self.get_job_details(job_id)
        if not job.external_job_id or (
            job.job_status in ("Completed", "Failed") and job.log_stream
        ):
            return job
        if self.db.claim_batch_refresh(job_id):
            observed_at = datetime.now(timezone.utc)
            jobs = self.batch.describe_jobs(jobs=[job.external_job_id]).get("jobs", [])
            if jobs:
                self.db.record_batch_details(job_id, jobs[0], observed_at)
            log_timing("batch_refresh", job_id=job_id, previous_status=job.job_status,
                       batch_status=jobs[0].get("status") if jobs else "missing",
                       elapsed_ms=round((time.monotonic() - started) * 1000))
        else:
            log_timing("batch_refresh_throttled", job_id=job_id)
        return self.get_job_details(job_id)

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
        return container_stream(detail)

    def get_log_page(self, job_id: UUID, cursor: str | None = None) -> JobLogPage:
        started = time.monotonic()
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

        job = self.refresh_job(job_id)
        if not job.external_job_id:
            log_timing("awaiting_dispatch", job_id=job_id)
            return JobLogPage(logs="", available=False, next_cursor=cursor,
                              message="Waiting for dispatch: no AWS Batch job has been linked yet.")
        stream = job.log_stream
        if not stream:
            log_timing("awaiting_stream", job_id=job_id, batch_status=job.batch_status)
            message = (f"AWS Batch: {job.batch_status}. " if job.batch_status else "")
            message += job.batch_status_reason or (
                "No log stream is recorded yet. The job may not have started, or its Batch metadata may have expired."
            )
            return JobLogPage(logs="", available=False, next_cursor=cursor, message=message)

        # Resolve the stream from the job record, never from a client cursor.
        reset = bool(previous and (
            previous["stream"] != stream or time.time() - previous["issued"] >= 23 * 3600
        ))
        token = previous["token"] if previous and not reset else None
        messages = []
        has_more = False
        pages_read = 0
        event_count = 0
        newest_event = None
        ingestion_delay = None
        try:
            # Bound both AWS requests and response size (up to three 1 MB pages).
            for _ in range(3):
                args = dict(
                    logGroupName=job.log_group or f"ecs/cwms-batch/{job.office.lower()}-jobs",
                    logStreamName=stream,
                    startFromHead=True,
                )
                if token:
                    args["nextToken"] = token
                page = self.logs.get_log_events(**args)
                pages_read += 1
                for event in page["events"]:
                    event_count += 1
                    if event.get("timestamp") is not None:
                        newest_event = max(newest_event or 0, event["timestamp"])
                        if event.get("ingestionTime") is not None:
                            ingestion_delay = max(ingestion_delay or 0, event["ingestionTime"] - event["timestamp"])
                messages.extend(event["message"] for event in page["events"])
                next_token = page.get("nextForwardToken")
                has_more = bool(next_token and next_token != token)
                token = next_token
                if not has_more:
                    break
        except ClientError as exc:
            log_timing("cloudwatch_error", job_id=job_id,
                       code=exc.response.get("Error", {}).get("Code"),
                       elapsed_ms=round((time.monotonic() - started) * 1000))
            if exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
                return JobLogPage(logs="", available=False, next_cursor=cursor,
                                  message="The CloudWatch log stream is not available yet or has expired.")
            if token and exc.response.get("Error", {}).get("Code") == "InvalidParameterException":
                raise ValueError("Invalid log cursor") from exc
            raise
        next_cursor = None
        log_timing("cloudwatch_page", job_id=job_id, batch_status=job.batch_status,
                   pages=pages_read, events=event_count, has_cursor=bool(cursor),
                   has_more=has_more, reset=reset,
                   elapsed_ms=round((time.monotonic() - started) * 1000),
                   newest_event_age_ms=round(time.time() * 1000 - newest_event) if newest_event is not None else None,
                   max_ingestion_delay_ms=ingestion_delay)
        if token:
            next_cursor = base64.urlsafe_b64encode(json.dumps({
                "job": str(job_id), "stream": stream, "token": token, "issued": time.time(),
            }).encode()).decode()
        return JobLogPage(
            logs="\n".join(messages), next_cursor=next_cursor,
            has_more=has_more, reset=reset,
        )

    def get_logs_for_job(self, job_id: UUID) -> str:
        job = self.refresh_job(job_id)

        if not job.external_job_id:
            raise ValueError(f"No external_job_id found for job_id {job_id}")
        log_name = job.log_stream
        if not log_name:
            raise LogsNotReady("No saved log stream; Batch metadata may have expired or the job has not started")

        log_group = job.log_group or f"ecs/cwms-batch/{job.office.lower()}-jobs"

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
