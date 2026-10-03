from datetime import datetime, timezone
from unittest.mock import patch

from cwms_batch_events.api.main import app
from cwms_batch_events.core.rate_limit import OfficeRateLimit


def test_queue_view_requires_hq_admin(client, user):
    response = client.get("/admin/queues")

    assert response.status_code == 403


def test_queue_view_returns_office_counts_and_active_jobs(client, user, db_session, monkeypatch):
    user.roles = {"HQ": ["Data Acquisition Mgr"], "SWT": ["CWMS Users"]}
    user.offices = ["SWT"]
    now = datetime(2026, 9, 30, 12, tzinfo=timezone.utc)
    office_result = type("Result", (), {"mappings": lambda self: self, "all": lambda self: [{
        "office": "SWT", "queued": 2, "running": 1, "cancelling": 0,
        "dispatch_unknown": 0, "submissions_last_minute": 3, "oldest_queued_at": now,
    }]})()
    active_result = type("Result", (), {"mappings": lambda self: self, "all": lambda self: []})()
    db_session.scalar.return_value = now
    db_session.execute.side_effect = [office_result, active_result]
    monkeypatch.setattr(app.state.rate_limit_store, "get", lambda offices: OfficeRateLimit(120, 10))
    with patch("cwms_batch_events.api.routers.admin.queue_attributes", return_value=(True, None, 4, 1)):
        response = client.get("/admin/queues")

    assert response.status_code == 200
    assert response.json()["offices"][0]["queued"] == 2
    assert response.json()["offices"][0]["submissionLimitPerMinute"] == 10
    assert response.json()["approximateMessagesAvailable"] == 4
