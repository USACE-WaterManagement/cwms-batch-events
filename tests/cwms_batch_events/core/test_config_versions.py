"""Historical commands are pinned to the runners at 3c830a4^, not v2 rules."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from pydantic import ValidationError

from cwms_batch_events.core.execution import (
    UnsupportedConfigVersion, command_for_payload, execution_for_config,
)
from cwms_batch_events.core.models import JobMessage, ScriptCreate, ScriptRunOptions, ScriptUpdate
from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from cwms_batch_events.local.executor import LocalExecutor
from tests.factories import make_job_message


@pytest.mark.parametrize("path", [
    "python/run_hourly.py", "/python/run_hourly.py", "./python/run_hourly.py",
    "python/../run_hourly.py", "../report.py", "/jobs/python/report.py",
    "python/two words.py", "python/report.py --office SWT",
])
def test_v1_reproduces_historical_commands_in_both_runners(path):
    payload = ScriptRunOptions(office="swt", script_slug="legacy", repo_path=path,
                               execution_type="historical-unused-value")
    assert payload.config_version == 1
    message = make_job_message(payload=payload)
    batch = Mock()
    batch.submit_job.return_value = {"jobId": "external-id"}
    with patch("cwms_batch_events.lambdas.dispatch_job.job_runner.batch.boto3.client", return_value=batch):
        BatchJobRunner().run_job(message)
    overrides = batch.submit_job.call_args.kwargs["containerOverrides"]
    assert overrides["command"] == ["python", f"/jobs/{path}"]
    assert not any(item["name"] == "SKIP_GIT_CLONE" for item in overrides["environment"])

    docker = Mock()
    docker.containers.run.return_value.wait.return_value = {"StatusCode": 0}
    docker.containers.run.return_value.logs.return_value = b"done"
    with patch("docker.client.from_env", return_value=docker):
        LocalExecutor(Mock(), Mock()).run_job(message)
    assert docker.containers.run.call_args.kwargs["command"] == f"python /jobs/{path}"
    assert "SKIP_GIT_CLONE=false" in docker.containers.run.call_args.kwargs["environment"]


def test_unversioned_queue_message_uses_v1_without_changing_envelope_version():
    raw = make_job_message().model_dump(mode="json")
    raw["payload"].pop("config_version", None)
    raw["payload"].pop("configVersion", None)
    raw["payload"]["repo_path"] = "/python/run_hourly.py"
    message = JobMessage.model_validate(raw)
    assert message.version == "1.0"
    assert message.payload.config_version == 1
    assert command_for_payload(message.payload) == ["python", "/jobs//python/run_hourly.py"]


def test_v1_ignores_fields_that_did_not_control_historical_execution():
    saved = SimpleNamespace(repo_path="/python/run_hourly.py", execution_type="command",
                            runtime="java", command_args=["--ignored"])
    options = execution_for_config(saved)
    assert command_for_payload(options) == ["python", "/jobs//python/run_hourly.py"]
    assert not hasattr(saved, "config_version")
    assert saved.execution_type == "command"
    assert saved.command_args == ["--ignored"]


@pytest.mark.parametrize("version", [-1, 0, 5, 99, None, True, "1"])
def test_unsupported_versions_fail_at_execution_boundary(version):
    with pytest.raises(UnsupportedConfigVersion, match="Unsupported script configuration schema version"):
        command_for_payload(SimpleNamespace(config_version=version, repo_path="report.py"))


@pytest.mark.parametrize("version", [0, 5, 99])
def test_unsupported_queued_versions_fail_deserialization(version):
    with pytest.raises(ValidationError, match=f"schema version {version}"):
        ScriptRunOptions(config_version=version, office="swt", script_slug="report", repo_path="report.py")


@pytest.mark.parametrize("model", [ScriptCreate, ScriptUpdate])
def test_current_writes_default_to_v4_and_cannot_choose_compatibility_format(model):
    fields = dict(office="SWT", name="Report", description="test", repo_path="report.py")
    assert model(**fields).config_version == 4
    for version in (1, 99):
        with pytest.raises(ValidationError):
            model(**fields, config_version=version)


@pytest.mark.parametrize("runtime,path,args,expected", [
    ("python", "python/report.py", ["two words", "", "$HOME"], ["python", "/jobs/python/report.py"]),
    ("java", "lib/report.jar", ["two words"], ["java", "-jar", "/jobs/lib/report.jar"]),
    ("shell", "bin/report.sh", ["$(false)"], ["bash", "/jobs/bin/report.sh"]),
])
def test_v2_local_runner_preserves_argv(runtime, path, args, expected):
    payload = ScriptRunOptions(config_version=2, office="swt", script_slug="report",
                               repo_path=path, runtime=runtime, command_args=args)
    assert command_for_payload(payload, runner="local") == expected + args


def test_v2_installed_command_local_runner_skips_checkout():
    payload = ScriptRunOptions(config_version=2, office="swt", script_slug="report",
                               execution_type="command", repo_path="echo", command_args=["two words", ""])
    docker = Mock()
    docker.containers.run.return_value.wait.return_value = {"StatusCode": 0}
    docker.containers.run.return_value.logs.return_value = b"done"
    with patch("docker.client.from_env", return_value=docker):
        LocalExecutor(Mock(), Mock()).run_job(make_job_message(payload=payload))
    assert docker.containers.run.call_args.kwargs["command"] == ["echo", "two words", ""]
    assert "SKIP_GIT_CLONE=true" in docker.containers.run.call_args.kwargs["environment"]
