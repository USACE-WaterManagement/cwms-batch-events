import logging

import boto3

from cwms_batch_events.core.models import EmailNotificationMessage
from cwms_batch_events.core.settings import settings

logger = logging.getLogger(__name__)


class NotificationSender:
    """Deliver notification messages without exposing message contents in logs."""

    def __init__(self, ses_client=None):
        self.delivery_mode = settings.notification_delivery_mode.lower()
        self.ses = ses_client

    def send(self, notification: EmailNotificationMessage) -> str:
        if self.delivery_mode == "log":
            logger.info(
                "Email notification accepted by local log sender: "
                "message_type=%s source=%s template=%s office=%s recipient_count=%d",
                notification.message_type,
                notification.source,
                notification.template or "-",
                notification.office,
                len(notification.recipients),
            )
            return "logged"
        if self.delivery_mode != "ses":
            raise ValueError(
                f"Unsupported NOTIFICATION_DELIVERY_MODE '{self.delivery_mode}'"
            )
        if not settings.notification_from_address:
            raise ValueError("NOTIFICATION_FROM_ADDRESS is required for SES delivery")

        ses = self.ses or boto3.client(
            "ses",
            region_name=settings.aws_default_region,
        )
        response = ses.send_email(
            Source=settings.notification_from_address,
            Destination={"ToAddresses": [str(item) for item in notification.recipients]},
            Message={
                "Subject": {"Data": notification.subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": notification.body, "Charset": "UTF-8"}},
            },
        )
        return response["MessageId"]
