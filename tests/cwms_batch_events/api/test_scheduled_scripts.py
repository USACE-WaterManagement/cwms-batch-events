from tests.factories import make_script_read


def test_scheduled_catalog_uses_authorized_catalog(client, job_db, user):
    due = make_script_read(
        schedule_enabled=True, schedule_type="hourly", schedule_minute=10
    )
    disabled = make_script_read(schedule_enabled=False)
    job_db.retrieve_script_catalog.return_value = [due, disabled]
    response = client.get("/scripts/scheduled")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [str(due.id)]
    job_db.retrieve_script_catalog.assert_called_once_with(user.roles)
