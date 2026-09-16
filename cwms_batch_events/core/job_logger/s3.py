import boto3
from botocore.exceptions import ClientError
from uuid import UUID

from cwms_batch_events.core.settings import StorageSettings, get_settings

from cwms_batch_events.core.models import JobLogPage

settings = get_settings(StorageSettings)



class S3JobLogger:
    def get_log_page(self, job_id: UUID, cursor: str | None = None) -> JobLogPage:
        # The local executor uploads a complete object only after execution.
        try:
            logs = self.get_logs_for_job(job_id)
        except FileNotFoundError:
            return JobLogPage(logs="", available=False, supports_live=False)
        return JobLogPage(logs=logs, reset=True, supports_live=False)

    def __init__(self):
        self.s3_bucket = settings.s3_bucket
        if not self.s3_bucket:
            raise ValueError("S3_BUCKET must be configured for S3 logging")

        self.s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.aws_default_region,
        )

    def get_logs_for_job(self, job_id: UUID) -> str:
        key = f"logs/{job_id}.log"
        try:
            response = self.s3.get_object(Bucket=self.s3_bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise FileNotFoundError(f"No logs found for job {job_id}") from exc
            raise
        body: str = response["Body"].read().decode("utf-8")
        return body

    def push_logs_for_job(self, job_id: UUID, logs: str) -> None:
        key = f"logs/{job_id}.log"
        self.s3.put_object(Bucket=self.s3_bucket, Key=key, Body=logs.encode("utf-8"))
