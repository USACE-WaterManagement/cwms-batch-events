from fastapi.testclient import TestClient

from cwms_batch_events.api.main import app


def test_get_default_job_runner_returns_configured_runner(client, monkeypatch):
    monkeypatch.setattr(
        "cwms_batch_events.api.routers.job_runners.get_runner_id",
        lambda: "13f391ef-7597-4b4b-a0ef-0926c09d4649",
    )
    monkeypatch.setattr(
        "cwms_batch_events.api.routers.job_runners.get_runner_slug",
        lambda: "docker-local",
    )

    response = client.get("/job-runners/default")

    assert response.status_code == 200
    assert response.json() == {
        "id": "13f391ef-7597-4b4b-a0ef-0926c09d4649",
        "slug": "docker-local",
    }


def test_get_default_job_runner_requires_auth():
    with TestClient(app) as client:
        response = client.get("/job-runners/default")

    assert response.status_code == 401
