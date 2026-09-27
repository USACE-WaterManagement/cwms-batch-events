import pytest
from datetime import datetime, timezone

from cwms_batch_events.api.main import app
from cwms_batch_events.core.rate_limit import OfficeRateLimit, OfficeRateLimitStore


@pytest.mark.parametrize("roles", [{}, {"SWT": ["Data Acquisition Mgr"]}, {"HQ": ["CWMS Users"]},
                                  {"HQ": ["Data Exchange Mgr"]}, {"HQ": ["CWMS Admin"]}])
def test_org_usage_requires_hq_admin_before_database_queries(client, user, db_session, roles):
    user.roles = roles
    assert client.get("/admin/operations").status_code == 403
    db_session.execute.assert_not_called()
    db_session.scalar.assert_not_called()


@pytest.mark.parametrize("query", ["days=0", "days=91", "queueMinutes=0", "queueMinutes=10081", "runMinutes=0", "runMinutes=43201"])
def test_report_windows_and_thresholds_are_bounded(client, user, db_session, query):
    user.roles = {"HQ": ["Data Acquisition Mgr"]}
    assert client.get(f"/admin/operations?{query}").status_code == 422
    db_session.execute.assert_not_called()


@pytest.mark.parametrize("query", ["taskSort=duration", "taskDirection=sideways"])
def test_task_sort_options_are_bounded(client, user, db_session, query):
    user.roles = {"HQ": ["Data Acquisition Mgr"]}
    assert client.get(f"/admin/operations?{query}").status_code == 422
    db_session.execute.assert_not_called()


def test_hq_admin_can_save_and_reset_office_rate_limits(client, user, db_session, monkeypatch):
    user.roles = {"HQ": ["Data Acquisition Mgr"]}
    db_session.scalars.return_value = ["SWT"]
    db_session.execute.return_value.mappings.return_value.one.return_value = {
        "changed_by": "test-user", "changed_at": datetime(2026, 9, 27, tzinfo=timezone.utc),
    }
    store = OfficeRateLimitStore(OfficeRateLimit(120, 10), session_factory=lambda: db_session)
    monkeypatch.setattr(store, "_refresh_if_due", lambda force=False: None)
    monkeypatch.setattr(app.state, "rate_limit_store", store)

    updated = client.put(
        "/admin/rate-limits/SWT",
        json={
            "requestsPerMinute": 240,
            "jobSubmissionsPerMinute": 40,
            "changedBy": "spoofed-user",
            "changedAt": "2000-01-01T00:00:00Z",
        },
    )

    assert updated.status_code == 200
    assert updated.json()["requestsPerMinute"] == 240
    assert updated.json()["changedBy"] == user.username
    assert updated.json()["changedAt"] == "2026-09-27T00:00:00Z"
    assert store.get(["SWT"]) == OfficeRateLimit(240, 40)
    assert db_session.execute.call_args_list[0].args[1]["changed_by"] == user.username
    db_session.commit.assert_called_once()

    reset = client.delete("/admin/rate-limits/SWT")

    assert reset.status_code == 204
    assert store.get(["SWT"]) == OfficeRateLimit(120, 10)


@pytest.mark.parametrize("office", ["EL", "SW", "SWT1", "SWT-"])
def test_rate_limit_office_code_requires_three_or_four_letters(client, user, db_session, office):
    user.roles = {"HQ": ["Data Acquisition Mgr"]}
    response = client.put(f"/admin/rate-limits/{office}", json={"requestsPerMinute": 120, "jobSubmissionsPerMinute": 10})
    assert response.status_code == 422
    db_session.execute.assert_not_called()
