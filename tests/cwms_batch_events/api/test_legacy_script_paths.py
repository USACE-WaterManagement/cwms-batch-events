from unittest.mock import MagicMock

import pytest

from cwms_batch_events.api.dependencies import get_job_database
from cwms_batch_events.api.main import app
from cwms_batch_events.core.job_database.postgres.models import JobModel, ScriptModel
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from tests.factories import make_job_record, make_script_read, make_script_create_payload


@pytest.mark.parametrize("path", ["/python/report.py", "../report.py"])
def test_legacy_paths_remain_readable_but_cannot_be_saved_or_run(client, job_queue, path):
    session = MagicMock()
    script = ScriptModel(**make_script_read(repo_path=path, roles=["CWMS Users"]).model_dump(by_alias=False))
    session.scalars.return_value.all.return_value = [script]
    session.get_one.return_value = script
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)

    for url in ("/scripts?office=SWT", "/scripts/catalog"):
        response = client.get(url)
        assert response.status_code == 200
        assert response.json()[0]["repoPath"] == path

    payload = make_script_create_payload(repoPath=path)
    assert client.post("/scripts", json=payload).status_code == 422
    assert client.put(f"/scripts/{script.id}", json=payload).status_code == 422
    response = client.post("/jobs", json={"scriptId": str(script.id)})
    assert response.status_code == 422
    assert "Correct its path" in response.json()["detail"]
    session.add.assert_not_called()
    session.commit.assert_not_called()
    job_queue.send_job_message.assert_not_called()


def test_historical_job_with_absolute_path_remains_readable(client):
    job = JobModel(**make_job_record(repo_path="/jobs/python/report.py").model_dump(by_alias=False))
    session = MagicMock()
    session.scalars.return_value.all.return_value = [job]
    session.get.return_value = job
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)
    assert client.get("/jobs").json()[0]["repoPath"] == job.repo_path
    assert client.get(f"/jobs/{job.id}").json()["repoPath"] == job.repo_path
