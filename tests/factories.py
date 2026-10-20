from datetime import datetime, timezone
from uuid import uuid4
from types import SimpleNamespace


def make_lambda_context():
    return SimpleNamespace(
        function_name="test-function", memory_limit_in_mb=256,
        invoked_function_arn="arn:aws:lambda:us-east-1:123456789012:function:test",
        aws_request_id="invocation-123",
    )

from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import (
    JobMessage,
    JobRecord,
    JobRequestedBy,
    JobSource,
    JobStatus,
    ScriptRead,
    ScriptRunOptions,
)


def make_user(**overrides) -> User:
    return User(
        username=overrides.pop("username", "test-user"),
        offices=overrides.pop("offices", ["SWT", "LRH"]),
        admin_offices=overrides.pop("admin_offices", ["SWT"]),
        roles=overrides.pop(
            "roles", {"SWT": ["CWMS Users"], "LRH": ["CWMS Users"]}
        ),
        **overrides,
    )


def make_job_record(**overrides) -> JobRecord:
    return JobRecord(
        id=overrides.pop("id", uuid4()),
        script_id=overrides.pop("script_id", uuid4()),
        script_name=overrides.pop("script_name", "Test Script"),
        script_slug=overrides.pop("script_slug", "test-script"),
        job_status=overrides.pop("job_status", JobStatus.PENDING),
        username=overrides.pop("username", "test-user"),
        office=overrides.pop("office", "SWT"),
        repo_path=overrides.pop("repo_path", "run.py"),
        execution_type=overrides.pop("execution_type", "batch"),
        created_time=overrides.pop("created_time", datetime.now(timezone.utc)),
        run_time=overrides.pop("run_time", None),
        end_time=overrides.pop("end_time", None),
        job_runner_id=overrides.pop("job_runner_id", uuid4()),
        external_job_id=overrides.pop("external_job_id", None),
        **overrides,
    )


def make_script_read(**overrides) -> ScriptRead:
    now = datetime.now(timezone.utc)
    return ScriptRead(
        id=overrides.pop("id", uuid4()),
        slug=overrides.pop("slug", "test-script"),
        office=overrides.pop("office", "SWT"),
        name=overrides.pop("name", "Test Script"),
        description=overrides.pop("description", "desc"),
        repo_path=overrides.pop("repo_path", "run.py"),
        execution_type=overrides.pop("execution_type", "batch"),
        active=overrides.pop("active", True),
        roles=overrides.pop("roles", []),
        job_runners=overrides.pop("job_runners", []),
        created_time=overrides.pop("created_time", now),
        updated_time=overrides.pop("updated_time", now),
        **overrides,
    )


def make_script_payload(**overrides) -> dict:
    return {
        "name": overrides.pop("name", "Test Script"),
        "description": overrides.pop("description", "desc"),
        "repoPath": overrides.pop("repoPath", "run.py"),
        "executionType": overrides.pop("executionType", "batch"),
        "active": overrides.pop("active", True),
        "roles": overrides.pop("roles", []),
        "jobRunners": overrides.pop("jobRunners", []),
        **overrides,
    }


def make_script_create_payload(**overrides) -> dict:
    return {
        "office": overrides.pop("office", "SWT"),
        **make_script_payload(**overrides),
    }


def make_job_message(**overrides) -> JobMessage:
    return JobMessage(
        version=overrides.pop("version", "1.0"),
        job_id=overrides.pop("job_id", uuid4()),
        runner_type=overrides.pop("runner_type", "batch"),
        requested_by=overrides.pop(
            "requested_by",
            JobRequestedBy(username="tester", source=JobSource.API),
        ),
        created_at=overrides.pop("created_at", datetime.now(timezone.utc)),
        payload=overrides.pop(
            "payload",
            ScriptRunOptions(
                office="swt",
                repo_path="run.py",
                script_slug="script",
            ),
        ),
        **overrides,
    )
