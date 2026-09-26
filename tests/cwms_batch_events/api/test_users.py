from cwms_batch_events.api.routers import users as users_router


def test_get_admin_offices_returns_current_user_admin_offices(client, user):
    response = client.get("/users/me/admin-offices")

    assert response.status_code == 200
    assert response.json() == user.admin_offices


def test_get_office_groups_returns_offices_sorted_by_division(client, user):
    response = client.get("/users/me/office-groups")

    assert response.status_code == 200
    assert response.json() == {"lrd": ["LRH"], "swd": ["SWT"]}


def test_get_office_groups_prefers_cda_reports_to(monkeypatch, client, user):
    class CdaResponse:
        ok = True

        @staticmethod
        def json():
            return [
                {"name": "LRH", "reports-to": "LRD"},
                {"name": "SWT", "reportsTo": "SAD"},
            ]

    monkeypatch.setattr(users_router.requests, "get", lambda *args, **kwargs: CdaResponse())

    response = client.get("/users/me/office-groups", headers={"Authorization": "Bearer test"})

    assert response.status_code == 200
    assert response.json() == {"LRD": ["LRH"], "SAD": ["SWT"]}
