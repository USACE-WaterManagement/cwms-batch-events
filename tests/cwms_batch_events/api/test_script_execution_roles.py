from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from cwms_batch_events.api.dependencies import get_current_user, get_job_database
from cwms_batch_events.api.main import app
from cwms_batch_events.core.job_database.postgres.models import ScriptModel
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from tests.factories import make_script_read, make_user


@pytest.mark.parametrize(
    "script_roles,user_roles,active,allowed",
    [
        ([], {"SWT": []}, True, True),
        ([], {"SWT": ["Data Exchange Mgr"]}, True, True),
        ([], {}, True, False),
        ([], {"LRH": ["CWMS Users"]}, True, False),
        (["CWMS Users"], {"SWT": []}, True, False),
        (["CWMS Users"], {}, True, False),
        (["CWMS Users"], {"SWT": ["Data Exchange Mgr"]}, True, False),
        (["CWMS Users"], {"SWT": ["CWMS Users"]}, True, True),
        (["CWMS Users", "Data Exchange Mgr"], {"SWT": ["Data Exchange Mgr"]}, True, True),
        ([], {"SWT": ["CWMS Users"]}, False, False),
        (["CWMS Users"], {"SWT": ["CWMS Users"]}, False, False),
    ],
)
@pytest.mark.parametrize("custom", [False, True])
def test_catalog_and_submission_agree_on_execution_access(
    client, job_queue, monkeypatch, script_roles, user_roles, active, allowed, custom
):
    script = ScriptModel(**make_script_read(
        config_version=2,
        roles=script_roles, active=active, execution_type="command",
        repo_path="bash", command_args=["-lc", "printf 'TZ=%s\\n' \"$TZ\""],
    ).model_dump(by_alias=False))
    session = MagicMock()
    session.get_one.return_value = script
    session.scalars.return_value.all.return_value = [script]
    session.refresh.side_effect = lambda job: setattr(job, "created_time", datetime.now(timezone.utc))
    monkeypatch.setattr("cwms_batch_events.core.job_database.postgres.postgres.get_runner_id", lambda: script.id)
    app.dependency_overrides[get_job_database] = lambda: PostgresJobDatabase(session)
    app.dependency_overrides[get_current_user] = lambda: make_user(roles=user_roles)

    catalog = client.get("/scripts/catalog")
    assert catalog.status_code == 200
    assert len(catalog.json()) == int(allowed)
    payload = {"scriptId": str(script.id)}
    if custom:
        payload["commandArgs"] = ["--date", "2026-09-01"]
    response = client.post("/jobs", json=payload)
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        assert response.json()["repoPath"] == "bash"
        assert response.json()["commandArgs"] == (payload["commandArgs"] if custom else script.command_args)
        session.add.assert_called_once()
        session.commit.assert_called_once()
        job_queue.send_job_message.assert_called_once()
    else:
        session.add.assert_not_called()
        session.commit.assert_not_called()
        job_queue.send_job_message.assert_not_called()
