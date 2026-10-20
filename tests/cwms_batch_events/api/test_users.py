import pytest


def test_get_admin_offices_returns_current_user_admin_offices(client, user):
    response = client.get("/users/me/admin-offices")

    assert response.status_code == 200
    assert response.json() == user.admin_offices


@pytest.mark.parametrize(
    "roles, expected",
    [
        ({"HQ": ["Data Acquisition Mgr"]}, True),
        ({"HQ": ["Data Exchange Mgr"]}, True),
        ({"SWT": ["Data Exchange Mgr"]}, False),
    ],
)
def test_system_admin_includes_hq_data_exchange_manager(client, user, roles, expected):
    user.roles = roles

    response = client.get("/users/me/system-admin")

    assert response.json() is expected
