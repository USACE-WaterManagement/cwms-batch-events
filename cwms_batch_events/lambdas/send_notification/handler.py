"""Deliver rendered email notifications received from SQS."""

import logging
from typing import Any

from cwms_batch_events.core.notification_queue import parse_notification_message
from cwms_batch_events.core.notification_sender import NotificationSender

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(
    event: dict[str, Any], _context: Any
) -> dict[str, list[dict[str, str]]]:
    """Process an SQS batch and report only the messages that need a retry."""
    sender = NotificationSender()
    failures: list[dict[str, str]] = []

    for record in event.get("Records", []):
        message_id = record.get("messageId", "unknown")
        receive_count = record.get("attributes", {}).get("ApproximateReceiveCount")

        try:
            notification = parse_notification_message(record["body"])
            delivery_id = sender.send(notification)
        except Exception:
            logger.exception(
                "Notification delivery failed; returning message to SQS: "
                "message_id=%s receive_count=%s",
                message_id,
                receive_count,
            )
            failures.append({"itemIdentifier": message_id})
            continue

        logger.info(
            "Notification delivered: message_id=%s delivery_id=%s "
            "message_type=%s source=%s template=%s office=%s",
            message_id,
            delivery_id,
            notification.message_type,
            notification.source,
            notification.template or "-",
            notification.office,
        )

    return {"batchItemFailures": failures}
