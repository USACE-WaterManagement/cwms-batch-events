import io
import json
from unittest.mock import patch
from urllib.error import URLError

import pytest

from cwms_batch_events.core.settings import RepositorySettings, get_settings

settings = get_settings()
from tests.factories import make_script_read, make_script_create_payload


@pytest.fixture
def configured_repository(monkeypatch, user):
    monkeypatch.setattr("cwms_batch_events.api.routers.repository_files.installation_token", lambda: "test-token")
    office = user.admin_offices[0]
    monkeypatch.setattr(settings, "office_repositories", {
        office: RepositorySettings(repository="example/district-jobs", ref="release/jobs")
    })
    return office


def test_catalog_uses_configured_repository(client, configured_repository):
    payload = {"tree": [{"path": "python/report.py", "type": "blob"}, {"path": "python", "type": "tree"}]}
    with patch("cwms_batch_events.api.routers.repository_files.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as request:
        response = client.get("/repository-files", params={"office": configured_repository.lower()})
    assert response.status_code == 200
    assert response.json() == {"repository": "example/district-jobs", "ref": "release/jobs", "paths": ["python/report.py"], "warnings": [], "mock": False}
    assert "release%2Fjobs?recursive=1" in request.call_args.args[0].full_url


def test_catalog_requires_office_admin(client):
    with patch("cwms_batch_events.api.routers.repository_files.urlopen") as request:
        response = client.get("/repository-files?office=UNAUTHORIZED")
    assert response.status_code == 401
    request.assert_not_called()


def test_missing_credentials_keeps_conventional_repository(client, user, monkeypatch):
    monkeypatch.setattr(settings, "office_repositories", {})
    monkeypatch.setattr(settings, "github_app_secret_id", "")
    response = client.get("/repository-files", params={"office": user.admin_offices[0]})
    assert response.status_code == 200
    assert response.json()["repository"] == f"USACE-WaterManagement/{user.admin_offices[0].lower()}-wm-cwbi-jobs"
    assert response.json()["warnings"][0]["code"] == "github_app_not_configured"
    assert response.json()["paths"] == []


def test_incomplete_catalog_is_not_silently_displayed(client, configured_repository):
    with patch("cwms_batch_events.api.routers.repository_files.urlopen", return_value=io.BytesIO(b'{"truncated":true}')):
        response = client.get("/repository-files", params={"office": configured_repository})
    assert response.status_code == 200
    assert response.json()["warnings"][0]["code"] == "repository_catalog_truncated"


def test_github_errors_do_not_expose_credentials(client, configured_repository):
    with patch("cwms_batch_events.api.routers.repository_files.urlopen", side_effect=URLError("private error")):
        response = client.get("/repository-files", params={"office": configured_repository})
    assert response.status_code == 200
    assert response.json()["warnings"]
    assert "private error" not in response.text


def test_local_mock_needs_no_credentials(client, user, monkeypatch):
    monkeypatch.setattr(settings, "repository_mock_mode", True)
    monkeypatch.setattr(settings, "deployment_environment", "local")
    with patch("cwms_batch_events.api.routers.repository_files.installation_token") as token:
        response = client.get("/repository-files", params={"office": user.admin_offices[0]})
    token.assert_not_called()
    assert response.json()["mock"] is True
    assert "python/reports/example.py" in response.json()["paths"]


def test_mock_cannot_hide_missing_deployment_credentials(client, monkeypatch):
    monkeypatch.setattr(settings, "repository_mock_mode", True)
    monkeypatch.setattr(settings, "deployment_environment", "dev")
    monkeypatch.setattr(settings, "github_app_secret_id", "")
    assert client.get("/repository-status").json()["warnings"][0]["code"] == "github_app_not_configured"


@pytest.mark.parametrize("mock", [False, True])
def test_status_lists_only_users_repositories_without_admin_access(client, user, monkeypatch, mock):
    user.offices = ["SWT", "SWL"]
    user.admin_offices = []
    monkeypatch.setattr(settings, "repository_mock_mode", mock)
    monkeypatch.setattr(settings, "deployment_environment", "local")
    monkeypatch.setattr(settings, "github_app_secret_id", "")
    monkeypatch.setattr(settings, "office_repositories", {
        "SWT": RepositorySettings(repository="example/custom-jobs", ref="main"),
        "MVS": RepositorySettings(repository="example/other-district", ref="main"),
    })
    response = client.get("/repository-status")
    assert response.status_code == 200
    assert response.json()["repositories"] == {
        "SWL": "USACE-WaterManagement/swl-wm-cwbi-jobs",
        "SWT": "example/custom-jobs",
    }
    assert client.get("/repository-files?office=SWT").status_code == 401


@pytest.mark.parametrize("configured", [False, True])
def test_unreadable_secret_keeps_static_path_and_manual_save(client, user, job_db, monkeypatch, configured):
    office = user.admin_offices[0]
    monkeypatch.setattr(settings, "github_app_secret_id", "unreadable-app-secret")
    monkeypatch.setattr(settings, "repository_mock_mode", False)
    monkeypatch.setattr(settings, "deployment_environment", "cwbi-dev")
    monkeypatch.setattr(settings, "office_repositories", {
        office: RepositorySettings(repository="example/custom-jobs", ref="custom-branch")
    } if configured else {})
    job_db.store_script.return_value = make_script_read(repo_path="python/report.py")
    with patch("cwms_batch_events.core.github_app.boto3.client", side_effect=RuntimeError("private AWS error")) as aws:
        response = client.get("/repository-files", params={"office": office})
        assert response.status_code == 200
        catalog = response.json()
        assert catalog["repository"] == ("example/custom-jobs" if configured else f"USACE-WaterManagement/{office.lower()}-wm-cwbi-jobs")
        assert catalog["ref"] == ("custom-branch" if configured else "cwbi-dev")
        assert catalog["paths"] == []
        assert catalog["warnings"][0]["code"] == "github_app_secret_unavailable"
        assert "private AWS error" not in response.text
        saved = client.post("/scripts", json=make_script_create_payload(office=office, repoPath="python/report.py"))
        assert saved.status_code == 200
        assert saved.json()["repoPath"] == "python/report.py"
        assert aws.call_count == 1
