import pytest


@pytest.mark.parametrize("roles", [{}, {"SWT": ["CWMS Admin"]}, {"HQ": ["CWMS Users"]}])
def test_org_usage_requires_hq_admin_before_database_queries(client, user, db_session, roles):
    user.roles = roles
    assert client.get("/admin/operations").status_code == 403
    db_session.execute.assert_not_called()
    db_session.scalar.assert_not_called()


@pytest.mark.parametrize("query", ["days=0", "days=91", "queueMinutes=0", "queueMinutes=10081", "runMinutes=0", "runMinutes=43201"])
def test_report_windows_and_thresholds_are_bounded(client, user, db_session, query):
    user.roles = {"HQ": ["CWMS Admin"]}
    assert client.get(f"/admin/operations?{query}").status_code == 422
    db_session.execute.assert_not_called()
