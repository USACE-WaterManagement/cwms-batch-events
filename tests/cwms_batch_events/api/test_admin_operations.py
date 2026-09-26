import pytest


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
