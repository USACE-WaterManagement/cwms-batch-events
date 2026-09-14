from unittest import mock

import pytest
from pydantic import ValidationError

from cwms_batch_events.core.execution import command_for_payload
from cwms_batch_events.core.models import ScriptRunOptions, ScriptCreate, ScriptUpdate
from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from tests.factories import make_job_message


@pytest.mark.parametrize(
    "runtime,path,expected",
    [
        ("python", "python/report.py", ["python", "/jobs/python/report.py"]),
        ("python", "/jobs/python/report.py", ["python", "/jobs/python/report.py"]),
        ("java", "/jobs/java-artifacts/report.jar", ["java", "-jar", "/jobs/java-artifacts/report.jar"]),
        ("java", "lib/report.jar", ["java", "-jar", "/jobs/lib/report.jar"]),
        ("shell", "bin/report.sh", ["bash", "/jobs/bin/report.sh"]),
    ],
)
def test_repository_command(runtime, path, expected):
    payload = ScriptRunOptions(
        office="swt",
        script_slug="report",
        repo_path=path,
        runtime=runtime,
        command_args=["two words", "", "$HOME"],
    )
    assert command_for_payload(payload) == expected + ["two words", "", "$HOME"]


def test_installed_jar_preserves_arguments_and_office_definition():
    payload = ScriptRunOptions(
        office="swt",
        script_slug="report",
        repo_path="java",
        execution_type="command",
        runtime="java",
        command_args=["-jar", "/opt/report.jar", "two words", "$(false)"],
    )
    client = mock.Mock()
    client.submit_job.return_value = {"jobId": "external-id"}
    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.boto3.client",
        return_value=client,
    ):
        BatchJobRunner().run_job(make_job_message(payload=payload))
    request = client.submit_job.call_args.kwargs
    assert request["jobDefinition"] == "cwms-swt-jobs-jobdef"
    assert request["jobQueue"] == "cwms-swd-jq"
    assert request["containerOverrides"]["command"] == [
        "java",
        "-jar",
        "/opt/report.jar",
        "two words",
        "$(false)",
    ]
    assert request["containerOverrides"]["environment"] == [
        {"name": "OFFICE", "value": "swt"},
        {"name": "SKIP_GIT_CLONE", "value": "true"},
    ]


@pytest.mark.parametrize(
    "changes",
    [
        {"runtime": "node"},
        {"repo_path": "../escape.py"},
        {"repo_path": "/jobs/../escape.py"},
        {"repo_path": "/jobs/"},
        {"repo_path": "/escape.py"},
        {"repo_path": ""},
        {"command_args": ["bad\x00arg"]},
        {"execution_type": "unknown"},
    ],
)
def test_invalid_execution_is_rejected(changes):
    with pytest.raises(ValidationError):
        ScriptRunOptions.model_validate(
            dict(office="swt", script_slug="report", repo_path="report.py") | changes
        )


@pytest.mark.parametrize("legacy", ["python", "batch", "", None])
def test_legacy_execution_remains_python(legacy):
    payload = ScriptRunOptions(
        office="swt", script_slug="report", repo_path="report.py", execution_type=legacy
    )
    assert command_for_payload(payload) == ["python", "/jobs/report.py"]


@pytest.mark.parametrize("model", [ScriptCreate, ScriptUpdate])
def test_saved_legacy_jobs_prefix_is_normalized(model):
    script = model.model_validate({
        "office": "SWT", "name": "Report", "description": "Report",
        "repoPath": "/jobs/python/report.py",
    })
    assert script.repo_path == "python/report.py"
