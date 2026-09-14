from datetime import datetime
from unittest import mock

from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from tests.factories import make_job_message


def test_document_scan_uses_existing_swt_definition_without_document_bytes():
    message = make_job_message()
    message.document_scan = True
    message.payload.execution_type = "command"
    message.payload.repo_path = "/opt/document-scan/venv/bin/python"
    message.payload.command_args = [
        "/opt/document-scan/run.py",
        "--scan-id",
        str(message.job_id),
        "--bucket",
        "private-scans",
    ]
    client = mock.Mock()
    client.submit_job.return_value = {"jobId": "scan-batch-id"}
    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.boto3.client",
        return_value=client,
    ):
        BatchJobRunner().run_job(message)
    submission = client.submit_job.call_args.kwargs
    assert submission["jobDefinition"] == "cwms-swt-jobs-jobdef"
    assert submission["jobQueue"] == "cwms-swd-jq"
    assert submission["containerOverrides"]["command"] == [
        message.payload.repo_path,
        *message.payload.command_args,
    ]
    assert {"name": "SKIP_GIT_CLONE", "value": "true"} in submission[
        "containerOverrides"
    ]["environment"]


def test_batch_job_runner_submits_expected_batch_job():
    batch_client = mock.Mock()
    batch_client.submit_job.return_value = {"jobId": "ext-123"}
    fixed_now = datetime(2026, 4, 16, 12, 30)
    message = make_job_message()

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.boto3.client",
        return_value=batch_client,
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.datetime"
    ) as mock_datetime:
        mock_datetime.now.return_value = fixed_now
        runner = BatchJobRunner()
        job_id = runner.run_job(message)

    assert job_id == "ext-123"
    batch_client.submit_job.assert_called_once_with(
        jobName="cwms-swt-event-script-20260416-1230",
        jobQueue="cwms-swd-jq",
        jobDefinition="cwms-swt-jobs-jobdef",
        containerOverrides={
            "environment": [{"name": "OFFICE", "value": "swt"}],
            "command": ["python", "/jobs/run.py"],
        },
        tags={"Office": "swt"},
    )


def test_batch_job_runner_uses_repo_path_name_when_slug_missing():
    batch_client = mock.Mock()
    batch_client.submit_job.return_value = {"jobId": "ext-123"}
    fixed_now = datetime(2026, 4, 16, 12, 30)
    message = make_job_message(
        payload=make_job_message().payload.model_copy(
            update={"script_slug": None, "repo_path": "folder/my.script.py"}
        )
    )

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.boto3.client",
        return_value=batch_client,
    ), mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.datetime"
    ) as mock_datetime:
        mock_datetime.now.return_value = fixed_now
        runner = BatchJobRunner()
        runner.run_job(message)

    assert batch_client.submit_job.call_args.kwargs["jobName"] == (
        "cwms-swt-event-my_script_py-20260416-1230"
    )
