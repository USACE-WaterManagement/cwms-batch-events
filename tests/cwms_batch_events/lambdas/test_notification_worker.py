import json
from datetime import datetime, timezone
from unittest import mock

from cwms_batch_events.lambdas.send_notification.handler import lambda_handler


def notification_body(subject: str = "A job failed") -> str:
    return json.dumps(
        {
            "version": "1.1",
            "messageType": "job_failed",
            "source": "cwms-batch-events",
            "office": "SWT",
            "severity": "HIGH",
            "recipients": ["operator@example.com"],
            "subject": subject,
            "body": "Review the failed job.",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "template": "job-failed",
            "data": {"jobId": "job-123"},
        }
    )


def sqs_record(message_id: str, body: str) -> dict:
    return {
        "messageId": message_id,
        "body": body,
        "attributes": {"ApproximateReceiveCount": "1"},
    }


@mock.patch("cwms_batch_events.lambdas.send_notification.handler.NotificationSender")
def test_lambda_handler_delivers_valid_message(sender_class):
    sender_class.return_value.send.return_value = "ses-message-123"

    result = lambda_handler(
        {"Records": [sqs_record("message-1", notification_body())]}, None
    )

    assert result == {"batchItemFailures": []}
    sender_class.return_value.send.assert_called_once()


@mock.patch("cwms_batch_events.lambdas.send_notification.handler.NotificationSender")
def test_lambda_handler_returns_invalid_message_for_retry(sender_class):
    result = lambda_handler(
        {"Records": [sqs_record("message-1", "not-json")]}, None
    )

    assert result == {"batchItemFailures": [{"itemIdentifier": "message-1"}]}
    sender_class.return_value.send.assert_not_called()


@mock.patch("cwms_batch_events.lambdas.send_notification.handler.NotificationSender")
def test_lambda_handler_only_retries_failed_records(sender_class):
    sender_class.return_value.send.side_effect = [RuntimeError("SES unavailable"), "sent"]

    result = lambda_handler(
        {
            "Records": [
                sqs_record("message-1", notification_body("First")),
                sqs_record("message-2", notification_body("Second")),
            ]
        },
        None,
    )

    assert result == {"batchItemFailures": [{"itemIdentifier": "message-1"}]}
    assert sender_class.return_value.send.call_count == 2
