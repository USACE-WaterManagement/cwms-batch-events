import pytest
from uuid import uuid4


@pytest.mark.parametrize("roles", [{}, {"SWT": ["Data Acquisition Mgr"]}, {"HQ": ["CWMS Users"]},
                                  {"HQ": ["Data Exchange Mgr"]}, {"HQ": ["CWMS Admin"]}])
def test_scheduler_requires_hq_admin(client, user, roles):
    user.roles = roles
    assert client.get("/users/me/system-admin").json() is False
    assert client.get("/scheduler/status").status_code == 403


def test_hq_admin_capability(client, user):
    user.roles = {"HQ": ["Data Acquisition Mgr"]}
    assert client.get("/users/me/system-admin").json() is True


def test_script_history_is_paginated_with_office_scope(client, user, job_db):
    script_id = uuid4()
    job_db.get_jobs_for_offices.return_value = []
    job_db.count_jobs_for_offices.return_value = 23
    result = client.get(f"/jobs?scriptId={script_id}&limit=10&offset=10")
    assert result.status_code == 200
    assert result.headers["X-Total-Count"] == "23"
    job_db.get_jobs_for_offices.assert_called_once_with(user.offices, limit=10, offset=10, script_id=script_id)


def test_latest_per_script_does_not_fetch_entire_history(client, user, job_db):
    job_db.get_latest_jobs_for_offices.return_value = []
    assert client.get("/jobs?latestPerScript=true").status_code == 200
    job_db.get_latest_jobs_for_offices.assert_called_once_with(user.offices)
    job_db.get_jobs_for_offices.assert_not_called()
    assert client.get("/jobs?latestPerScript=true&limit=10").status_code == 422
