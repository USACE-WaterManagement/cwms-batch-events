import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
import uuid

from cwms_batch_events.core.models import JobRecord, JobStatus, ScriptRunRequest
from cwms_batch_events.core.settings import DynamoSettings, get_settings

from cwms_batch_events.core.utils import get_runner_id

settings = get_settings(DynamoSettings)


def dynamodb_item_to_python(item: Any) -> Any:
    if isinstance(item, dict):
        return {k: dynamodb_item_to_python(v) for k, v in item.items()}
    elif isinstance(item, list):
        return [dynamodb_item_to_python(i) for i in item]
    elif isinstance(item, Decimal):
        if item % 1 == 0:
            return int(item)
        else:
            return float(item)
    else:
        return item


dynamodb_endpoint = settings.dynamodb_host
table_name = "WM-Event-Manager-Jobs"

dynamodb = boto3.resource(
    "dynamodb",
    endpoint_url=dynamodb_endpoint,
)

job_table = dynamodb.Table(table_name)


class DynamoJobDatabase:
    def __init__(self):
        self.table = job_table

    def create_job(self, payload: ScriptRunRequest, user_id: str):
        job_id = uuid.uuid4()

        job = JobRecord(
            id=job_id,
            script_name=payload.script_name,
            username=user_id,
            office=payload.office_name,
            created_time=datetime.now(timezone.utc),
            job_status=JobStatus.PENDING,
            job_runner_id=get_runner_id(),
        )
        self.table.put_item(Item=job.model_dump(by_alias=False))
        return job

    def get_job_by_id(self, job_id: uuid.UUID) -> JobRecord | None:
        response = self.table.get_item(
            Key={"job_id": str(job_id)},
        )
        job = response.get("Item")
        if not job:
            return None
        return JobRecord(**dynamodb_item_to_python(job))

    def get_jobs_for_user(self, user_id: str):
        user_jobs = self.table.query(
            IndexName="user_index",
            Select="ALL_ATTRIBUTES",
            KeyConditionExpression=Key("user").eq(user_id),
            ScanIndexForward=False,
        )
        job_items = user_jobs.get("Items")
        return [JobRecord(**dynamodb_item_to_python(item)) for item in job_items]

    def update_job_field(self, job_id: uuid.UUID, key: str, value: Any):
        self.table.update_item(
            Key={"job_id": str(job_id)},
            UpdateExpression="set #S=:V",
            ExpressionAttributeNames={"#S": key},
            ExpressionAttributeValues={":V": value},
        )

    def update_job_status(self, job_id: uuid.UUID, status: JobStatus):
        now = datetime.now(timezone.utc).isoformat()

        self.table.update_item(
            Key={"job_id": str(job_id)},
            UpdateExpression="set #S=:V",
            ExpressionAttributeNames={"#S": "status"},
            ExpressionAttributeValues={":V": status},
        )

        if status == JobStatus.RUNNING:
            self.update_job_field(job_id, "run_time", now)
        elif status == JobStatus.COMPLETED or status == JobStatus.FAILED:
            self.update_job_field(job_id, "end_time", now)
