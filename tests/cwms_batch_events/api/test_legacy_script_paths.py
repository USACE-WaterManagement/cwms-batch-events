from unittest.mock import MagicMock

import pytest

from cwms_batch_events.api.dependencies import get_job_database
from cwms_batch_events.api.main import app
from cwms_batch_events.core.job_database.postgres.models import JobModel, ScriptModel
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.execution import command_for_payload
from tests.factories import make_job_record, make_script_read, make_script_create_payload


@pytest.mark.parametrize("path", ["/python/report.py", "../report.py"])
def test_legacy_paths_remain_readable_and_runnable_without_resaving(client, job_queue, path):
    session = MagicMock()
    script = ScriptModel(**make_script_read(repo_path=path, roles=["CWMS Users"]).model_dump(by_alias=False))
    session.scalars.return_value.all.return_value = [script]
    session.get_one.return_value = script
    session.refresh.side_effect = lambda job: setattr(job, "created_time", script.created_time)
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)

    for url in ("/scripts?office=SWT", "/scripts/catalog"):
        response = client.get(url)
        assert response.status_code == 200
        assert response.json()[0]["repoPath"] == path
        assert response.json()[0]["configVersion"] == 1

    session.commit.assert_not_called()

    payload = make_script_create_payload(repoPath=path)
    assert client.post("/scripts", json=payload).status_code == 422
    assert client.put(f"/scripts/{script.id}", json=payload).status_code == 422
    response = client.post("/jobs", json={"scriptId": str(script.id)})
    assert response.status_code == 200, response.text
    assert response.json()["configVersion"] == 1
    options = job_queue.create_job_message.call_args.args[3]
    assert command_for_payload(options) == ["python", f"/jobs/{path}"]
    assert script.config_version == 1
    assert script.repo_path == path
    assert script.execution_type == "batch"
    session.add.assert_called_once()
    job_queue.send_job_message.assert_called_once()


@pytest.mark.parametrize("version,path,error", [
    (1, "", "invalid execution settings"),
    (1, "bad\x00.py", "invalid execution settings"),
    (2, "../report.py", "invalid execution settings"),
    (99, "report.py", "Unsupported script configuration schema version 99"),
    (0, "report.py", "Unsupported script configuration schema version 0"),
])
def test_invalid_saved_configuration_never_creates_a_job(client, job_queue, version, path, error):
    session = MagicMock()
    script = ScriptModel(**make_script_read(config_version=version, repo_path=path).model_dump(by_alias=False))
    session.get_one.return_value = script
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)
    response = client.post("/jobs", json={"scriptId": str(script.id)})
    assert response.status_code == 422
    assert error in response.json()["detail"]
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
