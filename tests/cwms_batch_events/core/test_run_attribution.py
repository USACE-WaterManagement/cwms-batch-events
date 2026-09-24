from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from cwms_batch_events.core.display_names import readable_name
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.models import ScriptRunRequest
from tests.factories import make_job_record, make_user


@pytest.mark.parametrize("name", ["1234567890", "1234567890@mil", "DOE.JANE.1234567890", "1234"])
def test_numeric_identifiers_are_never_display_names(name):
    assert readable_name(name) == "Name unavailable"
    record = make_job_record(username=name, display_name=name).model_dump()
    assert record["username"] == "Name unavailable"
    assert record["displayName"] == "Name unavailable"


def test_legacy_runs_keep_readable_names_and_unknown_trigger():
    record = make_job_record(username="jane.doe").model_dump()
    assert record["displayName"] == "jane.doe"
    assert record["runTrigger"] == "unknown"


@pytest.mark.parametrize("trigger", ["manual", "scheduled", "unknown"])
def test_job_persists_authenticated_name_and_trigger(monkeypatch, trigger):
    job = make_job_record()
    script = SimpleNamespace(id=job.script_id, name="Report", slug="report", active=True,
        office="SWT", roles=[], repo_path="report.py", execution_type="github_file",
        runtime="python", command_args=[])
    session = MagicMock()
    session.get_one.return_value = script
    def refresh(row):
        row.created_time = job.created_time
    session.refresh.side_effect = refresh
    monkeypatch.setattr("cwms_batch_events.core.job_database.postgres.postgres.get_runner_id", lambda: job.job_runner_id)
    user = make_user(username="1234567890", display_name="Jane Doe")
    result = PostgresJobDatabase(session).create_job(ScriptRunRequest(script_id=job.script_id, run_trigger=trigger), user)
    stored = session.add.call_args.args[0]
    assert stored.username == "1234567890"  # Internal audit identity remains intact.
    assert stored.display_name == "Jane Doe"
    assert stored.run_trigger == trigger
    assert result.model_dump()["displayName"] == "Jane Doe"


def test_no_offices_query_cannot_return_all_jobs():
    from sqlalchemy.dialects import postgresql
    session = MagicMock()
    session.scalars.return_value.all.return_value = []
    database = PostgresJobDatabase(session)
    assert database.get_jobs_for_offices([]) == []
    query = session.scalars.call_args.args[0].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    assert "1 != 1" in str(query)
