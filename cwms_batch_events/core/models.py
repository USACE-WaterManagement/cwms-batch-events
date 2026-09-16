from datetime import datetime
from pathlib import PurePosixPath
from typing import Literal
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel
from uuid import UUID


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )

    def model_dump(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump(**kwargs)


class ExecutionRecord(CamelModel):
    """Stored execution fields, including paths accepted by older API versions."""

    execution_type: Literal["github_file", "command"] = "github_file"
    runtime: Literal["python", "java", "shell"] = "python"
    repo_path: str
    command_args: list[str] = Field(default_factory=list)

    @field_validator("execution_type", mode="before")
    @classmethod
    def legacy_execution_type(cls, value):
        # These historical values all dispatched Python repository files.
        return "github_file" if value in (None, "", "python", "batch") else value


class ExecutionOptions(ExecutionRecord):
    """Validated options for saving scripts and dispatching jobs."""

    @field_validator("repo_path")
    @classmethod
    def nonempty_target(cls, value):
        if not value.strip() or "\x00" in value:
            raise ValueError("A script path or executable is required")
        return value

    @model_validator(mode="after")
    def valid_repository_path(self):
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


class ScriptRunOptions(ExecutionOptions):
    office: str
    repo_path: str
    script_slug: str | None


class JobSource(str, Enum):
    API = "api"


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


class ScriptBase(ExecutionRecord):
    name: str
    description: str
    repo_path: str
    active: bool = True
    roles: list[str] = []
    job_runners: list[UUID] = []


class ScriptCreate(ScriptBase, ExecutionOptions):
    office: str


class ScriptRead(ScriptBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    office: str
    created_time: datetime
    updated_time: datetime
    job_runners: list[UUID] = []

    @field_validator("job_runners", mode="before")
    def extract_job_runner_ids(cls, v):
        return [jr.id if hasattr(jr, "id") else jr for jr in v]


class ScriptUpdate(ScriptBase, ExecutionOptions):
    pass
