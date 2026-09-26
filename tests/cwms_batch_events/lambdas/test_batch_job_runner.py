from cwms_batch_events.core.job_correlation import runner_environment
from datetime import datetime
from unittest import mock

from cwms_batch_events.lambdas.dispatch_job.job_runner.batch import BatchJobRunner
from tests.factories import make_job_message


def test_batch_job_runner_submits_expected_batch_job():
    batch_client = mock.Mock()
    batch_client.submit_job.return_value = {"jobId": "ext-123"}
    fixed_now = datetime(2026, 4, 16, 12, 30)
    message = make_job_message(request_id="a" * 32)
    message.payload.schedule_timezone = "America/Chicago"

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
            "environment": [{"name": "OFFICE", "value": "swt"}, {"name": "TZ", "value": "America/Chicago"},
                *[{"name": key, "value": value} for key, value in runner_environment(message).items()]],
            "command": ["python", "/jobs/run.py"],
            "resourceRequirements": [
                {"type": "VCPU", "value": "1"},
                {"type": "MEMORY", "value": "2048"},
            ],
        },
        tags={"Office": "swt", "BatchEventsJobId": str(message.job_id), "BatchEventsRequestId": "a" * 32},
    )


def test_batch_job_runner_uses_repo_path_name_when_slug_missing():
    batch_client = mock.Mock()
    batch_client.submit_job.return_value = {"jobId": "ext-123"}
    fixed_now = datetime(2026, 4, 16, 12, 30)
    message = make_job_message(
        payload=make_job_message().payload.model_copy(update={"script_slug": None, "repo_path": "folder/my.script.py"})
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


def test_batch_job_runner_uses_selected_resource_profile():
    batch_client = mock.Mock()
    batch_client.submit_job.return_value = {"jobId": "ext-123"}
    message = make_job_message()
    message.payload.resource_size = "large"

    with mock.patch(
        "cwms_batch_events.lambdas.dispatch_job.job_runner.batch.boto3.client",
        return_value=batch_client,
    ):
        BatchJobRunner().run_job(message)

    assert batch_client.submit_job.call_args.kwargs["containerOverrides"]["resourceRequirements"] == [
        {"type": "VCPU", "value": "2"},
        {"type": "MEMORY", "value": "4096"},
    ]
