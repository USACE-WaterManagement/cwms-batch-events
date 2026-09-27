from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import MagicMock

import pytest

from cwms_batch_events.core.schedules import next_run, is_due


def schedule(**changes):
    return SimpleNamespace(active=True, config_version=4, schedule_enabled=True,
        schedule_type=changes.get("schedule_type", "cron"), schedule_minute=15,
        schedule_cron=changes.get("schedule_cron", "30 8 * * *"),
        schedule_timezone=changes.get("schedule_timezone", "America/Chicago"))


@pytest.mark.parametrize("changes,after,expected", [
    ({}, "2026-09-24T13:30:00+00:00", "2026-09-25T13:30:00+00:00"),
    ({"schedule_type": "hourly"}, "2026-09-24T13:14:59+00:00", "2026-09-24T13:15:00+00:00"),
    ({"schedule_cron": "30 2 * * *"}, "2026-03-08T06:00:00+00:00", "2026-03-09T07:30:00+00:00"),
    ({"schedule_cron": "30 1 * * *"}, "2026-11-01T06:31:00+00:00", "2026-11-02T07:30:00+00:00"),
    ({"schedule_type": "monthly", "schedule_cron": "30 8 31 * *"}, "2026-02-01T00:00:00+00:00", "2026-02-28T14:30:00+00:00"),
    ({"schedule_cron": "30 8 31 * *"}, "2026-02-01T00:00:00+00:00", "2026-03-31T13:30:00+00:00"),
    ({"schedule_cron": "0 8 29 2 *", "schedule_timezone": "UTC"}, "2096-03-01T00:00:00+00:00", "2104-02-29T08:00:00+00:00"),
    ({"schedule_cron": "0 8 31 2 *"}, "2026-02-01T00:00:00+00:00", None),
])
def test_next_run_matches_dispatch_rules(changes, after, expected):
    script = schedule(**changes)
    result = next_run(script, datetime.fromisoformat(after))
    assert result == (datetime.fromisoformat(expected) if expected else None)
    if result:
        assert is_due(script, result)


@pytest.mark.parametrize("field,value", [("active", False), ("config_version", 3), ("schedule_enabled", False)])
def test_inactive_schedule_has_no_next_run(field, value):
    script = schedule()
    setattr(script, field, value)
    assert next_run(script, datetime.now(timezone.utc)) is None


def test_schedule_status_authorizes_before_reading_history(client, user, monkeypatch):
    from cwms_batch_events.api.routers import scheduler
    db = MagicMock()
    script = schedule()
    script.office = "UNAUTHORIZED"
    db.get.return_value = script
    @contextmanager
    def session():
        yield db
    monkeypatch.setattr(scheduler, "create_session", session)
    assert client.get(f"/scripts/{uuid4()}/schedule-status").status_code == 404
    db.scalar.assert_not_called()
    script.office = user.admin_offices[0]
    now = datetime(2026, 9, 24, 12, tzinfo=timezone.utc)
    db.scalar.side_effect = [now, SimpleNamespace(end_time=now, job_status="Completed", run_trigger="manual")]
    result = client.get(f"/scripts/{uuid4()}/schedule-status")
    assert result.status_code == 200
    assert result.json()["nextRunAt"] == "2026-09-24T13:30:00Z"
    assert result.json()["lastFinishedAt"] == "2026-09-24T12:00:00Z"
    assert result.json()["lastRunTrigger"] == "manual"


def test_office_filters_are_scoped_before_pagination(client, user, job_db):
    office = user.offices[0]
    assert client.get("/users/me/offices").json() == user.offices
    job_db.get_jobs_for_offices.return_value = []
    job_db.count_jobs_for_offices.return_value = 12
    response = client.get(f"/jobs?office={office.lower()}&office={office}&limit=10&offset=10")
    assert response.status_code == 200
    assert response.headers["X-Total-Count"] == "12"
    job_db.get_jobs_for_offices.assert_called_once_with([office], limit=10, offset=10)
    job_db.get_jobs_for_offices.reset_mock()
    assert client.get(f"/jobs?office={office}&office=UNAUTHORIZED").status_code == 403
    job_db.get_jobs_for_offices.assert_not_called()
