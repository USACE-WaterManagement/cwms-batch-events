from datetime import datetime, timezone
from unittest import mock
from uuid import uuid4

import requests

from cwms_batch_events.core.models import (
    NotificationTemplateRead,
    ScriptNotificationRuleDetails,
)
from cwms_batch_events.core.notifications import (
    enqueue_failed_job_notifications,
    get_cda_user_list_emails,
    get_cda_user_lists,
    render_notification,
)
from tests.factories import make_job_record


def make_rule(**overrides):
    now = datetime.now(timezone.utc)
    template = overrides.pop(
        "template",
        NotificationTemplateRead(
            id=uuid4(),
            office="SWT",
            slug="job_failure_v1",
            subjectTemplate="Job {{ scriptName }} failed",
            bodyTemplate="{{ jobId }}: {{ errorMessage }}",
            createdTime=now,
            updatedTime=now,
        ),
    )
    return ScriptNotificationRuleDetails(
        id=overrides.pop("id", uuid4()),
        scriptId=overrides.pop("script_id", uuid4()),
        eventType=overrides.pop("event_type", "job_failed"),
        templateId=template.id,
        cdaUserListId=overrides.pop("cda_user_list_id", None),
        cdaUserListOffice=overrides.pop("cda_user_list_office", None),
        manualRecipients=overrides.pop("manual_recipients", []),
        active=overrides.pop("active", True),
        createdTime=now,
        updatedTime=now,
        template=template,
    )


def test_render_notification_uses_jinja_templates():
    rendered = render_notification(
        subject_template="Job {{ scriptName }} failed",
        body_template="{{ jobId }}: {{ errorMessage }}",
        recipients=["one@example.mil"],
        data={
            "scriptName": "Hourly",
            "jobId": "job-123",
            "errorMessage": "boom",
        },
    )

    assert rendered.subject == "Job Hourly failed"
    assert rendered.body == "job-123: boom"
    assert rendered.recipients == ["one@example.mil"]


def test_cda_user_list_uses_service_account_bearer_token():
    token_response = mock.Mock()
    token_response.json.return_value = {
        "access_token": "service-token",
        "expires_in": 300,
    }
    response = mock.Mock()
    response.json.return_value = {
        "members": [
            {"email": "one@example.mil"},
            {"email": None},
        ]
    }
    with (
        mock.patch(
            "cwms_batch_events.core.notifications.settings.cda_client_id",
            "batch-events",
        ),
        mock.patch(
            "cwms_batch_events.core.notifications.settings.cda_client_secret",
            "secret",
        ),
        mock.patch(
            "cwms_batch_events.core.notifications.settings.cda_token_url",
            "https://identity.example/token",
        ),
        mock.patch(
            "cwms_batch_events.core.notifications.settings.cda_api_root",
            "https://cda.example/cwms-data/",
        ),
        mock.patch(
            "cwms_batch_events.core.notifications.requests.get",
            return_value=response,
        ) as request,
        mock.patch(
            "cwms_batch_events.core.notifications.requests.post",
            return_value=token_response,
        ) as token_request,
        mock.patch(
            "cwms_batch_events.core.notifications._token_cache",
            None,
        ),
    ):
        emails = get_cda_user_list_emails("SWT", "operators")

    assert emails == ["one@example.mil"]
    request.assert_called_once_with(
        "https://cda.example/cwms-data/user/list/operators/members",
        params={"office": "SWT"},
        headers={"Authorization": "Bearer service-token"},
        timeout=30,
    )
    token_request.assert_called_once_with(
        "https://identity.example/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "batch-events",
            "client_secret": "secret",
        },
        headers=None,
        timeout=30,
    )


def test_get_cda_user_lists_uses_selected_office():
    response = mock.Mock()
    response.json.return_value = {
        "user-lists": [
            {
                "office-id": "LRH",
                "user-list-id": "OPERATORS",
                "description": "On-call operators",
            }
        ]
    }
    with (
        mock.patch(
            "cwms_batch_events.core.notifications.settings.cda_api_root",
            "https://cda.example/cwms-data/",
        ),
        mock.patch(
            "cwms_batch_events.core.notifications.settings.cda_bearer_token",
            "service-token",
        ),
        mock.patch(
            "cwms_batch_events.core.notifications.requests.get",
            return_value=response,
        ) as request,
    ):
        user_lists = get_cda_user_lists("LRH")

    assert user_lists[0].user_list_id == "OPERATORS"
    request.assert_called_once_with(
        "https://cda.example/cwms-data/user/list",
        params={"office": "LRH"},
        headers={"Authorization": "Bearer service-token"},
        timeout=30,
    )


def test_render_notification_rejects_unknown_template_fields():
    with mock.patch(
        "cwms_batch_events.core.notifications.ALLOWED_TEMPLATE_FIELDS",
        {"jobId"},
    ):
        try:
            render_notification(
                subject_template="{{ secret }}",
                body_template="{{ jobId }}",
                recipients=["one@example.mil"],
                data={"jobId": "job-123"},
            )
        except ValueError as error:
            assert "secret" in str(error)
        else:
            raise AssertionError("Unknown template field should be rejected")


def test_manual_recipients_still_enqueue_when_cda_is_unavailable():
    db = mock.Mock()
    queue = mock.Mock()
    queue.send_notification.return_value = "message-123"
    job = make_job_record()
    rule = make_rule(
        script_id=job.script_id,
        cda_user_list_id="ON-CALL",
        cda_user_list_office="LRH",
        manual_recipients=["fallback@example.mil"],
    )
    db.get_active_job_failed_notification_rules.return_value = [rule]

    with mock.patch(
        "cwms_batch_events.core.notifications.get_cda_user_list_emails",
        side_effect=requests.RequestException("unavailable"),
    ) as resolve:
        response = enqueue_failed_job_notifications(job, db, queue)

    assert response == ["message-123"]
    assert queue.send_notification.call_args.args[0].recipients == [
        "fallback@example.mil"
    ]
    resolve.assert_called_once_with("LRH", "ON-CALL")


def test_failed_job_with_no_rules_does_not_enqueue():
    db = mock.Mock()
    queue = mock.Mock()
    job = make_job_record()
    db.get_active_job_failed_notification_rules.return_value = []

    response = enqueue_failed_job_notifications(job, db, queue)

    assert response == []
    queue.send_notification.assert_not_called()


def test_failed_job_with_no_recipients_does_not_enqueue():
    db = mock.Mock()
    queue = mock.Mock()
    job = make_job_record()
    rule = make_rule(script_id=job.script_id)
    db.get_active_job_failed_notification_rules.return_value = [rule]

    response = enqueue_failed_job_notifications(job, db, queue)

    assert response == []
    queue.send_notification.assert_not_called()


def test_failed_job_with_active_rule_enqueues_rendered_notification():
    db = mock.Mock()
    queue = mock.Mock()
    queue.send_notification.return_value = "message-123"
    job = make_job_record(script_name="Hourly")
    rule = make_rule(
        script_id=job.script_id,
        manual_recipients=["one@example.mil", "one@example.mil"],
    )
    db.get_active_job_failed_notification_rules.return_value = [rule]

    response = enqueue_failed_job_notifications(
        job,
        db,
        queue,
        error_message="boom",
        logs="traceback",
    )

    assert response == ["message-123"]
    message = queue.send_notification.call_args.args[0]
    assert message.template == "job_failure_v1"
    assert message.message_type == "job_failed"
    assert message.source == "cwms-batch-events"
    assert message.recipients == ["one@example.mil"]
    assert message.subject == "Job Hourly failed"
    assert message.body == f"{job.id}: boom"
    assert message.data["logs"] == "traceback"
