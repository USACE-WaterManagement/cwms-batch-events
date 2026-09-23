from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from cwms_batch_events.api.dependencies import get_job_database
from cwms_batch_events.api.main import app
from cwms_batch_events.core.job_database.postgres.models import ScriptModel
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from tests.factories import make_script_read


@pytest.mark.parametrize("arguments", [None, [], ["--date", "2026-09-01", "two words", "", "$(literal)"]])
def test_custom_run_snapshots_arguments_without_changing_script(client, job_queue, monkeypatch, arguments):
    script = ScriptModel(**make_script_read(config_version=2, office="SWT", roles=[],
        repo_path="report.py", command_args=["--today"]).model_dump(by_alias=False))
    session = MagicMock()
    session.get_one.return_value = script
    session.refresh.side_effect = lambda job: setattr(job, "created_time", datetime.now(timezone.utc))
    monkeypatch.setattr("cwms_batch_events.core.job_database.postgres.postgres.get_runner_id", lambda: script.id)
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)

    response = client.post("/jobs", json={"scriptId": str(script.id), "commandArgs": arguments})
    assert response.status_code == 200
    expected = ["--today"] if arguments is None else arguments
    assert response.json()["commandArgs"] == expected
    assert job_queue.create_job_message.call_args.args[3].command_args == expected
    assert script.command_args == ["--today"]
    assert script.config_version == 2
    # A subsequent ordinary run still uses the saved arguments.
    assert client.post("/jobs", json={"scriptId": str(script.id)}).json()["commandArgs"] == ["--today"]


@pytest.mark.parametrize("arguments", [["bad\x00argument"], "--not-an-array", [123]])
def test_invalid_custom_arguments_do_not_create_or_dispatch_job(client, job_db, job_queue, arguments):
    response = client.post("/jobs", json={"scriptId": "00000000-0000-0000-0000-000000000001", "commandArgs": arguments})
    assert response.status_code == 422
    job_db.create_job.assert_not_called()
    job_queue.send_job_message.assert_not_called()


def test_legacy_custom_run_is_rejected_without_modifying_script(client, job_queue):
    script = ScriptModel(**make_script_read(config_version=1, office="SWT", roles=[]).model_dump(by_alias=False))
    session = MagicMock()
    session.get_one.return_value = script
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)
    response = client.post("/jobs", json={"scriptId": str(script.id), "commandArgs": ["--date"]})
    assert response.status_code == 422
    assert script.config_version == 1
    session.add.assert_not_called()
    job_queue.send_job_message.assert_not_called()
