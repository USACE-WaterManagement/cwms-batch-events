import logging
import os

import boto3
from pydantic import ValidationError

from cwms_batch_events.core.notification_queue import parse_notification_message
from cwms_batch_events.core.notification_sender import NotificationSender

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger()

logger.info("Starting the notification worker...")

sqs = boto3.client(
    "sqs",
    endpoint_url="http://elasticmq:9324",
    region_name="us-gov-west-1",
    aws_access_key_id="x",
    aws_secret_access_key="x",
)

QUEUE_URL = os.environ.get("QUEUE_URL", "")
sender = NotificationSender()

while True:
    logger.info("Waiting for notification messages...")
    resp = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=20,
        AttributeNames=["ApproximateReceiveCount"],
    )

    for msg in resp.get("Messages", []):
        body_raw = msg["Body"]

        try:
            notification = parse_notification_message(body_raw)
            delivery_id = sender.send(notification)
        except (ValidationError, ValueError):
            logger.exception(
                "Notification rejected; leaving it for retry or dead-letter handling: "
                "message_id=%s receive_count=%s",
                msg.get("MessageId"),
                msg.get("Attributes", {}).get("ApproximateReceiveCount"),
            )
            continue
        except Exception:
            logger.exception(
                "Notification delivery failed; leaving it on the queue: "
                "message_id=%s receive_count=%s",
                msg.get("MessageId"),
                msg.get("Attributes", {}).get("ApproximateReceiveCount"),
            )
            continue

        logger.info(
            "Notification delivered: message_id=%s delivery_id=%s "
            "message_type=%s source=%s template=%s office=%s",
            msg.get("MessageId"),
            delivery_id,
            notification.message_type,
            notification.source,
            notification.template or "-",
            notification.office,
        )

        sqs.delete_message(
            QueueUrl=QUEUE_URL,
            ReceiptHandle=msg["ReceiptHandle"],
        )
