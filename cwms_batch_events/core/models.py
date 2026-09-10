from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )

    def model_dump(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump(**kwargs)


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


class JobRecord(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    script_id: UUID | None
    script_name: str
    script_slug: str | None
    job_status: JobStatus
    username: str
    office: str
    repo_path: str
    execution_type: str | None
    created_time: datetime
    run_time: datetime | None = None
    end_time: datetime | None = None
    job_runner_id: UUID
    external_job_id: str | None = None


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


class ScriptRunOptions(CamelModel):
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


class NotificationSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class LegacyNotificationMessage(BaseModel):
    version: Literal["1.0"]
    template: str
    office: str
    severity: NotificationSeverity
    recipients: list[EmailStr] = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=998)
    body: str = Field(min_length=1, max_length=100_000)
    created_at: datetime
    data: dict[str, str | None]


class EmailNotificationMessage(CamelModel):
    version: Literal["1.1"] = "1.1"
    message_type: str = Field(
        min_length=1, max_length=128, pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$"
    )
    source: str = Field(min_length=1, max_length=128)
    office: str = Field(min_length=1, max_length=16)
    severity: NotificationSeverity
    recipients: list[EmailStr] = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=998)
    body: str = Field(min_length=1, max_length=100_000)
    created_at: datetime
    template: str | None = Field(default=None, max_length=128)
    data: dict[str, str | None] = Field(default_factory=dict)


class NotificationEventType(str, Enum):
    JOB_FAILED = "job_failed"


class CdaUserListRead(BaseModel):
    office_id: str = Field(alias="office-id")
    user_list_id: str = Field(alias="user-list-id")
    description: str | None = None


class NotificationTemplateBase(CamelModel):
    office: str = Field(min_length=1, max_length=16)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$", max_length=128)
    subject_template: str = Field(min_length=1, max_length=998)
    body_template: str = Field(min_length=1, max_length=100_000)


class NotificationTemplateCreate(NotificationTemplateBase):
    pass


class NotificationTemplateUpdate(NotificationTemplateBase):
    pass


class NotificationTemplateRead(NotificationTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    usage_count: int = Field(default=0, ge=0)
    created_time: datetime
    updated_time: datetime


class ScriptNotificationRuleBase(CamelModel):
    script_id: UUID
    event_type: NotificationEventType = NotificationEventType.JOB_FAILED
    template_id: UUID
    cda_user_list_id: str | None = Field(default=None, max_length=128)
    cda_user_list_office: str | None = Field(default=None, max_length=16)
    manual_recipients: list[EmailStr] = Field(default_factory=list, max_length=100)
    active: bool = True

    @field_validator("manual_recipients")
    @classmethod
    def normalize_recipients(cls, recipients):
        return list(dict.fromkeys(str(recipient).lower() for recipient in recipients))

    @field_validator("cda_user_list_id")
    @classmethod
    def normalize_user_list_id(cls, user_list_id):
        return user_list_id.strip().upper() if user_list_id else None

    @field_validator("cda_user_list_office")
    @classmethod
    def normalize_user_list_office(cls, office):
        return office.strip().upper() if office else None

    @model_validator(mode="after")
    def require_complete_user_list_reference(self):
        if bool(self.cda_user_list_id) != bool(self.cda_user_list_office):
            raise ValueError(
                "CDA user list ID and office must be provided together"
            )
        return self


class ScriptNotificationRuleCreate(ScriptNotificationRuleBase):
    pass


class ScriptNotificationRuleUpdate(ScriptNotificationRuleBase):
    pass


class ScriptNotificationRuleRead(ScriptNotificationRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_time: datetime
    updated_time: datetime


class ScriptNotificationRuleDetails(ScriptNotificationRuleRead):
    template: NotificationTemplateRead


class NotificationPreviewRequest(CamelModel):
    job_id: UUID | None = None
    data: dict[str, str | None] = Field(default_factory=dict)
    subject_template: str | None = None
    body_template: str | None = None


class RenderedNotification(CamelModel):
    recipients: list[EmailStr]
    subject: str
    body: str
    data: dict[str, str | None]


class BatchJobStatusUpdateRequest(BaseModel):
    status: JobStatus
    event_time: datetime


class BindExternalJobIdRequest(BaseModel):
    external_job_id: str


class ScriptBase(CamelModel):
    name: str
    description: str
    repo_path: str
    execution_type: str
    active: bool = True
    roles: list[str] = []
    job_runners: list[UUID] = []


class ScriptCreate(ScriptBase):
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


class ScriptUpdate(ScriptBase):
    pass
