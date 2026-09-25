from datetime import datetime
from pathlib import PurePosixPath
from typing import Literal
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator
from cwms_batch_events.core.display_names import readable_name
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic.alias_generators import to_camel
from uuid import UUID
from cwms_batch_events.core.schedules import validate_cron, validate_schedule_interval


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )

    def model_dump(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump(**kwargs)


class ExecutionRecord(CamelModel):
    """Stored execution fields, including paths accepted by older API versions."""

    config_version: int = Field(default=1, strict=True)
    execution_type: str | None = "github_file"
    runtime: str = "python"
    repo_path: str
    command_args: list[str] = Field(default_factory=list)
    command_mode: str = "arguments"
    shell_command: str | None = None


class ExecutionOptions(ExecutionRecord):
    """Validated writes; persisted versions retain their execution semantics."""

    config_version: Literal[2, 3, 4] = 4
    execution_type: Literal["github_file", "command"] = "github_file"
    runtime: Literal["python", "java", "shell"] = "python"
    command_mode: Literal["arguments", "shell"] = "arguments"

    @field_validator("execution_type", mode="before")
    @classmethod
    def legacy_execution_type(cls, value):
        # These historical values all dispatched Python repository files.
        return "github_file" if value in (None, "", "python", "batch") else value

    @model_validator(mode="after")
    def valid_repository_path(self):
        if self.config_version == 2 and (self.command_mode != "arguments" or self.shell_command is not None):
            raise ValueError("Shell commands require script configuration version 3")
        if self.command_mode == "shell":
            if not self.shell_command or not self.shell_command.strip() or "\x00" in self.shell_command:
                raise ValueError("A Bash command without NUL characters is required")
            if self.command_args:
                raise ValueError("Shell mode uses shellCommand, not commandArgs")
            return self
        elif self.shell_command is not None:
            raise ValueError("shellCommand is only valid in shell mode")
        if not self.repo_path.strip() or "\x00" in self.repo_path:
            raise ValueError("A script path or executable is required")
        path = PurePosixPath(self.repo_path)
        if self.execution_type == "github_file" and self.repo_path.startswith("/jobs/"):
            self.repo_path = self.repo_path[len("/jobs/"):]
            if not self.repo_path:
                raise ValueError("A script path within /jobs is required")
            path = PurePosixPath(self.repo_path)
        if self.execution_type == "github_file" and (
            path.is_absolute() or ".." in path.parts
        ):
            raise ValueError("Repository paths must stay within /jobs")
        return self

    @field_validator("command_args")
    @classmethod
    def valid_arguments(cls, values):
        if any("\x00" in value for value in values):
            raise ValueError("Command arguments cannot contain NUL characters")
        return values


class JobStatus(str, Enum):
    FAILED = "Failed"
    PENDING = "Pending"
    RUNNING = "Running"
    COMPLETED = "Completed"


class CdaUserProfile(BaseModel):
    user_name: str = Field(alias="user-name")
    principal: str | None = None
    cac_auth: bool = Field(alias="cac-auth")
    roles: dict[str, list[str]]


class JobLogs(CamelModel):
    logs: str


class JobLogPage(JobLogs):
    message: str | None = None
    next_cursor: str | None = None
    has_more: bool = False
    reset: bool = False
    available: bool = True
    supports_live: bool = True


class JobRecord(ExecutionRecord):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    script_id: UUID | None
    script_name: str
    script_slug: str | None
    job_status: JobStatus
    username: str
    display_name: str | None = None
    run_trigger: Literal["manual", "scheduled", "unknown"] = "unknown"
    scheduled_for: datetime | None = None
    schedule_timezone: str | None = None
    schedule_author: str | None = None
    dispatch_claimed_at: datetime | None = None

    @field_serializer("username")
    def public_username(self, value: str) -> str:
        return readable_name(value)

    @field_serializer("display_name")
    def public_display_name(self, value: str | None) -> str:
        return readable_name(value, self.username)

    office: str
    repo_path: str
    created_time: datetime
    run_time: datetime | None = None
    end_time: datetime | None = None
    job_runner_id: UUID
    external_job_id: str | None = None
    log_group: str | None = None
    log_stream: str | None = None
    batch_status: str | None = None
    batch_status_reason: str | None = None


class JobRunner(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    label: str
    description: str
    active: bool
    created_time: datetime


class DefaultJobRunner(CamelModel):
    id: UUID
    slug: str


class OfficeCatalog(CamelModel):
    scripts: list[str]


class OfficeCatalogs(CamelModel):
    catalogs: dict[str, OfficeCatalog]


class ScriptRunRequest(CamelModel):
    script_id: UUID
    upgrade_to_version: Literal[3] | None = None
    command_mode: Literal["arguments", "shell"] | None = None
    shell_command: str | None = None
    command_args: list[str] | None = Field(
        default=None,
        description="Arguments for this run only. Omit or use null for saved arguments; [] clears them. Requires version 2 or later.",
    )

    @field_validator("command_args")
    @classmethod
    def valid_arguments(cls, values):
        if values is not None and any("\x00" in value for value in values):
            raise ValueError("Command arguments cannot contain NUL characters")
        return values
    run_trigger: Literal["manual", "scheduled", "unknown"] = Field(
        default="unknown",
        description="Caller-reported trigger for display only; grants no permissions. UI sends manual; cron/scheduler clients send scheduled. Omitted values remain unknown.",
    )


class ScriptRunOptions(ExecutionRecord):
    office: str
    repo_path: str
    script_slug: str | None

    @model_validator(mode="after")
    def validate_execution_schema(self):
        from cwms_batch_events.core.execution import execution_for_config

        options = execution_for_config(self)
        self.repo_path = options.repo_path
        self.execution_type = options.execution_type
        self.runtime = options.runtime
        self.command_args = options.command_args
        self.command_mode = options.command_mode
        self.shell_command = options.shell_command
        return self


class JobSource(str, Enum):
    API = "api"
    SCHEDULER = "scheduler"


class JobRequestedBy(BaseModel):
    username: str
    source: JobSource


class JobMessage(BaseModel):
    version: str
    job_id: UUID
    runner_type: str
    requested_by: JobRequestedBy
    created_at: datetime
    payload: ScriptRunOptions
    # Optional for compatibility with messages queued before correlation support.
    request_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")


class BatchJobStatusUpdateRequest(BaseModel):
    status: JobStatus
    event_time: datetime
    batch_detail: dict | None = None


class BindExternalJobIdRequest(BaseModel):
    external_job_id: str


def _validate_schedule_timezone(value: str | None) -> str:
    timezone_name = (value or "UTC").strip()
    if not timezone_name:
        raise ValueError("scheduleTimezone is required")
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(
            f"scheduleTimezone is not a valid timezone: {timezone_name}"
        ) from exc
    return timezone_name


class ScriptBase(CamelModel):
    name: str
    description: str
    repo_path: str
    active: bool = True
    roles: list[str] = []
    job_runners: list[UUID] = []
    schedule_enabled: bool = False
    schedule_type: str = "manual"
    schedule_minute: int | None = None
    schedule_cron: str | None = None
    schedule_timezone: str = "UTC"

    @field_validator("schedule_type")
    def validate_schedule_type(cls, value: str) -> str:
        if value not in {"manual", "hourly", "monthly", "cron"}:
            raise ValueError("scheduleType must be one of: manual, hourly, monthly, cron")
        return value

    @field_validator("schedule_minute")
    def validate_schedule_minute(cls, value: int | None) -> int | None:
        if value is not None and not 0 <= value <= 59:
            raise ValueError("scheduleMinute must be between 0 and 59")
        return value

    @field_validator("schedule_cron")
    def validate_schedule_cron(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None

        return validate_cron(value)

    @field_validator("schedule_timezone")
    def validate_schedule_timezone(cls, value: str | None) -> str:
        return _validate_schedule_timezone(value)

    def enforce_schedule_interval(self):
        if self.schedule_enabled and self.schedule_type == "cron" and self.schedule_cron:
            validate_schedule_interval(self.schedule_cron)
        return self

    @model_validator(mode="after")
    def validate_enabled_schedule(self):
        if self.schedule_type == "monthly":
            fields = (self.schedule_cron or "").split()
            if len(fields) != 5 or not all(field.isdigit() for field in fields[:3]) or fields[3:] != ["*", "*"]:
                raise ValueError("Monthly schedules require a numeric minute, hour, and day followed by * *")
        if not self.schedule_enabled:
            return self

        if self.schedule_type == "manual":
            raise ValueError(
                "scheduleType must be hourly, monthly, or cron when scheduleEnabled is true"
            )

        if self.schedule_type == "hourly" and self.schedule_minute is None:
            raise ValueError(
                "scheduleMinute is required when scheduleEnabled is true and scheduleType is hourly"
            )

        if self.schedule_type == "cron" and not self.schedule_cron:
            raise ValueError(
                "scheduleCron is required when scheduleEnabled is true and scheduleType is cron"
            )

        return self


class ScriptCreate(ScriptBase, ExecutionOptions):
    _minimum_interval = model_validator(mode="after")(ScriptBase.enforce_schedule_interval)

    office: str

    @model_validator(mode="after")
    def schedule_requires_v4(self):
        if self.config_version < 4 and (self.schedule_enabled or self.schedule_type != "manual"):
            raise ValueError("Scheduling requires configuration version 4. Use Upgrade configuration first.")
        return self


class ScriptRead(ScriptBase, ExecutionRecord):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    office: str
    created_time: datetime
    updated_time: datetime
    schedule_updated_name: str | None = None
    schedule_updated_at: datetime | None = None
    schedule_error: str | None = None
    job_runners: list[UUID] = []

    @field_validator("job_runners", mode="before")
    def extract_job_runner_ids(cls, v):
        return [jr.id if hasattr(jr, "id") else jr for jr in v]


class ScriptUpdate(ScriptBase, ExecutionOptions):
    _minimum_interval = model_validator(mode="after")(ScriptBase.enforce_schedule_interval)

    @model_validator(mode="after")
    def schedule_requires_v4(self):
        if self.config_version < 4 and (self.schedule_enabled or self.schedule_type != "manual"):
            raise ValueError("Scheduling requires configuration version 4. Use Upgrade configuration first.")
        return self
