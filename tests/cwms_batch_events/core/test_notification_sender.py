from unittest import mock

from cwms_batch_events.core.models import EmailNotificationMessage
from cwms_batch_events.core.notification_sender import NotificationSender


def make_notification():
    return EmailNotificationMessage(
        version="1.1",
        messageType="operations_notice",
        source="test-suite",
        template="job_failure_v1",
        office="SWT",
        severity="HIGH",
        recipients=["one@example.mil"],
        subject="Job failed",
        body="See Batch Events for details.",
        created_at="2026-07-25T12:00:00Z",
        data={"jobId": "job-123"},
    )


def test_log_delivery_does_not_call_ses():
    ses = mock.Mock()
    with mock.patch(
        "cwms_batch_events.core.notification_sender.settings.notification_delivery_mode",
        "log",
    ):
        response = NotificationSender(ses).send(make_notification())

    assert response == "logged"
    ses.send_email.assert_not_called()


def test_ses_delivery_uses_configured_sender():
    ses = mock.Mock()
    ses.send_email.return_value = {"MessageId": "ses-123"}
    with (
        mock.patch(
            "cwms_batch_events.core.notification_sender.settings.notification_delivery_mode",
            "ses",
        ),
        mock.patch(
            "cwms_batch_events.core.notification_sender.settings.notification_from_address",
            "batch-events@example.mil",
        ),
    ):
        response = NotificationSender(ses).send(make_notification())

    assert response == "ses-123"
    ses.send_email.assert_called_once_with(
        Source="batch-events@example.mil",
        Destination={"ToAddresses": ["one@example.mil"]},
        Message={
            "Subject": {"Data": "Job failed", "Charset": "UTF-8"},
            "Body": {
                "Text": {
                    "Data": "See Batch Events for details.",
                    "Charset": "UTF-8",
                }
            },
        },
    )
