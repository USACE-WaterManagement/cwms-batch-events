from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.exc import NoResultFound, SQLAlchemyError

from cwms_batch_events.core.job_database.postgres.postgres import TemplateInUseError
from cwms_batch_events.core.models import (
    NotificationTemplateRead,
    ScriptNotificationRuleRead,
)
from tests.factories import make_job_record


def make_template(**overrides):
    now = datetime.now(timezone.utc)
    return NotificationTemplateRead(
        id=overrides.pop("id", uuid4()),
        office=overrides.pop("office", "SWT"),
        slug=overrides.pop("slug", "job_failure_v1"),
        subjectTemplate=overrides.pop("subject_template", "Job {{ scriptName }} failed"),
        bodyTemplate=overrides.pop("body_template", "{{ jobId }}"),
        usageCount=overrides.pop("usage_count", 0),
        createdTime=overrides.pop("created_time", now),
        updatedTime=overrides.pop("updated_time", now),
    )


def make_rule(**overrides):
    now = datetime.now(timezone.utc)
    return ScriptNotificationRuleRead(
        id=overrides.pop("id", uuid4()),
        scriptId=overrides.pop("script_id", uuid4()),
        eventType=overrides.pop("event_type", "job_failed"),
        templateId=overrides.pop("template_id", uuid4()),
        cdaUserListId=overrides.pop("cda_user_list_id", "data-admins"),
        cdaUserListOffice=overrides.pop("cda_user_list_office", "SWT"),
        manualRecipients=overrides.pop("manual_recipients", ["one@example.mil"]),
        active=overrides.pop("active", True),
        createdTime=overrides.pop("created_time", now),
        updatedTime=overrides.pop("updated_time", now),
    )


def template_payload(**overrides):
    return {
        "office": overrides.pop("office", "SWT"),
        "slug": overrides.pop("slug", "job_failure_v1"),
        "subjectTemplate": overrides.pop(
            "subjectTemplate", "Job {{ scriptName }} failed"
        ),
        "bodyTemplate": overrides.pop("bodyTemplate", "{{ jobId }}"),
        **overrides,
    }


def test_get_templates_requires_admin_access(client):
    response = client.get("/notifications/templates", params={"office": "LRH"})

    assert response.status_code == 403


def test_create_and_list_templates(client, job_db):
    template = make_template()
    job_db.store_notification_template.return_value = template
    job_db.get_notification_templates_for_office.return_value = [template]

    create_response = client.post(
        "/notifications/templates", json=template_payload()
    )
    list_response = client.get(
        "/notifications/templates", params={"office": "SWT"}
    )

    assert create_response.status_code == 200
    assert create_response.json()["id"] == str(template.id)
    assert list_response.status_code == 200
    assert list_response.json()[0]["slug"] == "job_failure_v1"


def test_list_templates_maps_database_error_to_service_unavailable(client, job_db):
    job_db.get_notification_templates_for_office.side_effect = SQLAlchemyError("boom")

    response = client.get(
        "/notifications/templates", params={"office": "SWT"}
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Notification database is unavailable; migrations may still be running"
    )


def test_list_cda_user_lists_for_admin_office(client, monkeypatch):
    monkeypatch.setattr(
        "cwms_batch_events.api.routers.notifications.get_cda_user_lists",
        lambda office: [
            {
                "office-id": office,
                "user-list-id": "OPERATORS",
                "description": "On-call operators",
            }
        ],
    )

    response = client.get(
        "/notifications/cda-user-lists", params={"office": "SWT"}
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "office-id": "SWT",
            "user-list-id": "OPERATORS",
            "description": "On-call operators",
        }
    ]


def test_list_cda_user_lists_requires_admin_office(client):
    response = client.get(
        "/notifications/cda-user-lists", params={"office": "LRH"}
    )

    assert response.status_code == 403


def test_templates_require_an_office_scope(client, job_db):
    payload = template_payload()
    payload.pop("office")

    create_response = client.post("/notifications/templates", json=payload)
    list_response = client.get("/notifications/templates")

    assert create_response.status_code == 422
    assert list_response.status_code == 422
    job_db.store_notification_template.assert_not_called()


def test_rule_rejects_invalid_manual_recipient(client, job_db):
    rule = make_rule()
    payload = {
        "scriptId": str(rule.script_id),
        "eventType": "job_failed",
        "templateId": str(rule.template_id),
        "manualRecipients": ["not-an-email"],
        "active": True,
    }

    response = client.post("/notifications/rules", json=payload)

    assert response.status_code == 422
    job_db.store_script_notification_rule.assert_not_called()


def test_rule_requires_user_list_office(client, job_db):
    rule = make_rule()
    payload = {
        "scriptId": str(rule.script_id),
        "eventType": "job_failed",
        "templateId": str(rule.template_id),
        "cdaUserListId": "OPERATORS",
        "active": True,
    }

    response = client.post("/notifications/rules", json=payload)

    assert response.status_code == 422
    job_db.store_script_notification_rule.assert_not_called()


def test_update_and_delete_template(client, job_db):
    template = make_template()
    job_db.update_notification_template.return_value = template

    put_response = client.put(
        f"/notifications/templates/{template.id}", json=template_payload()
    )
    delete_response = client.delete(f"/notifications/templates/{template.id}")

    assert put_response.status_code == 200
    assert delete_response.status_code == 204
    job_db.remove_notification_template_if_allowed.assert_called_once()


def test_notification_template_missing_maps_to_404(client, job_db):
    job_db.update_notification_template.side_effect = NoResultFound()

    response = client.put(
        f"/notifications/templates/{uuid4()}", json=template_payload()
    )

    assert response.status_code == 404


def test_notification_template_in_use_maps_to_conflict(client, job_db):
    job_db.remove_notification_template_if_allowed.side_effect = TemplateInUseError(2)

    response = client.delete(f"/notifications/templates/{uuid4()}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Template is used by 2 scripts"


def test_create_and_manage_rules(client, job_db):
    rule = make_rule()
    job_db.store_script_notification_rule.return_value = rule
    job_db.get_script_notification_rules.return_value = [rule]
    job_db.update_script_notification_rule.return_value = rule

    payload = {
        "scriptId": str(rule.script_id),
        "eventType": "job_failed",
        "templateId": str(rule.template_id),
        "cdaUserListId": rule.cda_user_list_id,
        "cdaUserListOffice": rule.cda_user_list_office,
        "manualRecipients": rule.manual_recipients,
        "active": True,
    }
    create_response = client.post("/notifications/rules", json=payload)
    list_response = client.get(
        "/notifications/rules", params={"script_id": str(rule.script_id)}
    )
    update_response = client.put(f"/notifications/rules/{rule.id}", json=payload)
    delete_response = client.delete(f"/notifications/rules/{rule.id}")

    assert create_response.status_code == 200
    assert list_response.json()[0]["id"] == str(rule.id)
    assert update_response.status_code == 200
    assert delete_response.status_code == 204


def test_preview_template_renders_job_data(client, job_db):
    template = make_template()
    job = make_job_record(script_name="Hourly")
    job_db.get_notification_template_if_allowed.return_value = template
    job_db.get_job_by_id.return_value = job

    response = client.post(
        f"/notifications/templates/{template.id}/preview",
        json={
            "jobId": str(job.id),
            "data": {"errorMessage": "boom"},
        },
    )

    assert response.status_code == 200
    assert response.json()["subject"] == "Job Hourly failed"
    assert response.json()["body"] == str(job.id)
