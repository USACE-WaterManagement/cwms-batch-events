import pytest
from uuid import uuid4

from sqlalchemy.exc import NoResultFound

from cwms_batch_events.core.job_database.postgres.postgres import SlugError
from tests.factories import make_script_create_payload, make_script_payload, make_script_read


def test_get_scripts_for_office_requires_admin_access(client):
    response = client.get("/scripts", params={"office": "LRH"})

    assert response.status_code == 401
    assert response.json() == {
        "detail": "User does not have script admin access for office 'LRH'"
    }


def test_get_scripts_for_office_returns_scripts(client, job_db):
    script = make_script_read()
    job_db.get_scripts_for_office.return_value = [script]

    response = client.get("/scripts", params={"office": "SWT"})

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(script.id)
    job_db.get_scripts_for_office.assert_called_once_with("SWT")


def test_export_script_configuration_requires_office_admin(client, job_db):
    script = make_script_read()
    job_db.get_script_by_id.return_value = script

    response = client.get(f"/scripts/{script.id}/configuration-export")

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == 1
    assert body["configurationKey"] == str(script.configuration_key)
    assert body["sourceOffice"] == "SWT"
    assert body["configuration"]["name"] == script.name
    job_db.get_script_by_id.assert_called_once_with(script.id)


def test_import_script_configuration_creates_with_export_key(client, job_db):
    script = make_script_read()
    job_db.get_script_by_configuration_key.return_value = None
    job_db.store_script.return_value = script
    package = {
        "schemaVersion": 1,
        "configurationKey": str(script.configuration_key),
        "sourceOffice": "LRH",
        "configuration": {
            "configVersion": 4,
            "name": "Imported Script",
            "description": "restored",
            "repoPath": "run.py",
            "executionType": "github_file",
            "runtime": "python",
            "commandArgs": [],
            "commandPlaceholder": None,
            "commandMode": "arguments",
            "shellCommand": None,
            "releaseJar": None,
            "environmentVariables": [],
            "resourceSize": "medium",
            "active": True,
            "roles": [],
            "scheduleEnabled": False,
            "scheduleType": "manual",
            "scheduleMinute": None,
            "scheduleCron": None,
            "scheduleTimezone": "UTC",
        },
    }

    response = client.post("/scripts/configuration-import", json={
        "targetOffice": "SWT", "package": package,
    })

    assert response.status_code == 200
    assert job_db.store_script.call_args.kwargs["configuration_key"] == script.configuration_key
    assert job_db.store_script.call_args.kwargs["actor"].username == "test-user"


def test_import_script_configuration_merges_selected_existing_fields(client, job_db):
    existing = make_script_read(name="Existing")
    imported = make_script_read(id=existing.id, configuration_key=existing.configuration_key)
    job_db.get_script_by_configuration_key.return_value = existing
    job_db.update_script.return_value = imported
    package = {
        "schemaVersion": 1,
        "configurationKey": str(existing.configuration_key),
        "sourceOffice": "SWT",
        "configuration": {
            "configVersion": 4,
            "name": "Imported",
            "description": "new description",
            "repoPath": "run.py",
            "executionType": "github_file",
            "runtime": "python",
            "commandArgs": [],
            "commandPlaceholder": None,
            "commandMode": "arguments",
            "shellCommand": None,
            "releaseJar": None,
            "environmentVariables": [],
            "resourceSize": "medium",
            "active": True,
            "roles": [],
            "scheduleEnabled": False,
            "scheduleType": "manual",
            "scheduleMinute": None,
            "scheduleCron": None,
            "scheduleTimezone": "UTC",
        },
    }

    response = client.post("/scripts/configuration-import", json={
        "targetOffice": "SWT", "package": package,
        "selections": {"name": "existing"},
    })

    assert response.status_code == 200
    update_payload = job_db.update_script.call_args.args[1]
    assert update_payload.name == "Existing"
    assert update_payload.description == "new description"


def test_post_script_returns_created_script(client, job_db):
    script = make_script_read()
    job_db.store_script.return_value = script

    response = client.post("/scripts", json=make_script_create_payload())

    assert response.status_code == 200
    assert response.json()["id"] == str(script.id)
    job_db.store_script.assert_called_once()


@pytest.mark.parametrize(
    ("side_effect", "expected_status", "expected_detail"),
    [
        (ValueError("bad payload"), 422, "bad payload"),
        (SlugError("slug in use"), 409, "slug in use"),
    ],
)
def test_post_script_maps_errors(client, job_db, side_effect, expected_status, expected_detail):
    job_db.store_script.side_effect = side_effect

    response = client.post("/scripts", json=make_script_create_payload())

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}


def test_put_script_returns_updated_script(client, job_db):
    script = make_script_read()
    job_db.update_script.return_value = script

    response = client.put(f"/scripts/{script.id}", json=make_script_payload())

    assert response.status_code == 200
    assert response.json()["id"] == str(script.id)
    job_db.update_script.assert_called_once()


def test_put_script_returns_404_when_missing(client, job_db):
    job_db.update_script.side_effect = NoResultFound()
    script_id = str(uuid4())

    response = client.put(f"/scripts/{script_id}", json=make_script_payload())

    assert response.status_code == 404
    assert response.json() == {"detail": f"Script {script_id} not found"}


@pytest.mark.parametrize(
    ("side_effect", "expected_status", "expected_detail"),
    [
        (PermissionError("no access"), 401, "no access"),
        (ValueError("bad payload"), 422, "bad payload"),
    ],
)
def test_put_script_maps_other_errors(client, job_db, side_effect, expected_status, expected_detail):
    job_db.update_script.side_effect = side_effect

    response = client.put(f"/scripts/{uuid4()}", json=make_script_payload())

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}


def test_delete_script_returns_no_content(client, job_db):
    script_id = str(uuid4())

    response = client.delete(f"/scripts/{script_id}")

    assert response.status_code == 204
    job_db.remove_script_if_allowed.assert_called_once()


def test_delete_script_returns_404_when_missing(client, job_db):
    job_db.remove_script_if_allowed.side_effect = NoResultFound()
    script_id = str(uuid4())

    response = client.delete(f"/scripts/{script_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": f"Script {script_id} not found"}


def test_delete_script_returns_401_for_permission_error(client, job_db):
    script_id = str(uuid4())
    job_db.remove_script_if_allowed.side_effect = PermissionError("no access")

    response = client.delete(f"/scripts/{script_id}")

    assert response.status_code == 401
    assert response.json() == {"detail": "no access"}


def test_get_scripts_catalog_returns_role_filtered_catalog(client, job_db):
    script = make_script_read()
    job_db.retrieve_script_catalog.return_value = [script]

    response = client.get("/scripts/catalog")

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(script.id)
    job_db.retrieve_script_catalog.assert_called_once_with(
        {"SWT": ["CWMS Users"], "LRH": ["CWMS Users"]}
    )
