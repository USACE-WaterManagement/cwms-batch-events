import json

import boto3

from cwms_batch_events.core.models import (
    EmailNotificationMessage,
    LegacyNotificationMessage,
)
from cwms_batch_events.core.settings import settings

MESSAGE_VERSION = "1.1"


def parse_notification_message(message_body: str) -> EmailNotificationMessage:
    payload = json.loads(message_body)
    if payload.get("version") == "1.0":
        legacy = LegacyNotificationMessage.model_validate(payload)
        return EmailNotificationMessage(
            messageType=legacy.template,
            source="legacy",
            office=legacy.office,
            severity=legacy.severity,
            recipients=legacy.recipients,
            subject=legacy.subject,
            body=legacy.body,
            createdAt=legacy.created_at,
            template=legacy.template,
            data=legacy.data,
        )
    return EmailNotificationMessage.model_validate(payload)


class NotificationQueue:
    def __init__(self):
        self.sqs = boto3.resource(
            "sqs",
            endpoint_url=settings.sqs_endpoint_url,
            region_name=settings.aws_default_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        self.queue = self.sqs.get_queue_by_name(
            QueueName=settings.notification_queue_name
        )

    def send_notification(self, message: EmailNotificationMessage) -> str:
        response = self.queue.send_message(
            MessageBody=message.model_dump_json(by_alias=True)
        )
        return response["MessageId"]
