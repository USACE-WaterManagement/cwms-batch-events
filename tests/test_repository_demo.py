from fastapi.testclient import TestClient

from cwms_batch_events.core.settings import get_settings

settings = get_settings()
from tools.repository_demo import create_demo


def test_demo_switches_catalog_and_saves_manual_path_without_external_access(monkeypatch):
    monkeypatch.setattr(settings, "deployment_environment", "local")
    monkeypatch.setattr(settings, "github_app_secret_id", "")
    monkeypatch.setattr(settings, "repository_mock_mode", False)
    with TestClient(create_demo()) as client:
        assert client.get("/repository-files?office=SWT").json()["warnings"][0]["code"] == "github_app_not_configured"
        legacy = client.get("/scripts?office=SWT").json()[0]
        assert legacy["repoPath"] == "python/reports/example.py"
        updated = client.put(f"/scripts/{legacy['id']}", json=legacy | {"configVersion": 2})
        assert updated.status_code == 200
        assert updated.json()["repoPath"] == "python/reports/example.py"
        assert client.post("/_demo/scenario?value=sample-files").status_code == 200
        catalog = client.get("/repository-files?office=SWT").json()
        assert catalog["mock"] and catalog["paths"] and not catalog["warnings"]
        assert client.post("/jobs", json={"scriptId": legacy["id"]}).status_code == 409
