def test_get_admin_offices_returns_current_user_admin_offices(client, user):
    response = client.get("/users/me/admin-offices")

    assert response.status_code == 200
    assert response.json() == user.admin_offices
