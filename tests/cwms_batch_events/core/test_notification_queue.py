import json
from unittest import mock

from cwms_batch_events.core.models import (
    EmailNotificationMessage,
    NotificationSeverity,
)
from cwms_batch_events.core.notification_queue import (
    MESSAGE_VERSION,
    NotificationQueue,
    parse_notification_message,
)


def test_send_notification_returns_message_id():
    queue = NotificationQueue.__new__(NotificationQueue)
    queue.queue = mock.Mock()
    queue.queue.send_message.return_value = {"MessageId": "notification-123"}
    message = EmailNotificationMessage(
        version=MESSAGE_VERSION,
        messageType="job_failed",
        source="cwms-batch-events",
        template="job_failure_v1",
        office="SWT",
        severity=NotificationSeverity.HIGH,
        recipients=["alerts@example.mil"],
        subject="Job failed",
        body="Something broke",
        created_at="2026-04-16T12:00:00Z",
        data={"jobId": "job-123"},
    )

    response = queue.send_notification(message)

    assert response == "notification-123"
    body = json.loads(queue.queue.send_message.call_args.kwargs["MessageBody"])
    assert body["version"] == "1.1"
    assert body["messageType"] == "job_failed"
    assert body["source"] == "cwms-batch-events"
    assert body["createdAt"] == "2026-04-16T12:00:00Z"


def test_parse_legacy_notification_message():
    parsed = parse_notification_message(
        json.dumps(
            {
                "version": "1.0",
                "template": "job_failure_v1",
                "office": "SWT",
                "severity": "HIGH",
                "recipients": ["alerts@example.mil"],
                "subject": "Job failed",
                "body": "Something broke",
                "created_at": "2026-04-16T12:00:00Z",
                "data": {"jobId": "job-123"},
            }
        )
    )

    assert parsed.version == "1.1"
    assert parsed.message_type == "job_failure_v1"
    assert parsed.source == "legacy"
    assert parsed.template == "job_failure_v1"


def test_parse_generic_email_notification_message():
    parsed = parse_notification_message(
        EmailNotificationMessage(
            messageType="operations_notice",
            source="another-producer",
            office="SWT",
            severity="MEDIUM",
            recipients=["alerts@example.mil"],
            subject="Operations notice",
            body="A non-job email",
            createdAt="2026-04-16T12:00:00Z",
        ).model_dump_json(by_alias=True)
    )

    assert parsed.message_type == "operations_notice"
    assert parsed.template is None
