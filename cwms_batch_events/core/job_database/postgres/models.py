import datetime
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    String,
    func,
    Table,
    UUID,
    VARCHAR,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
import uuid

from cwms_batch_events.core.models import JobStatus


class Base(DeclarativeBase):
    type_annotation_map = {datetime.datetime: DateTime(timezone=True), str: VARCHAR}


scripts_job_runners = Table(
    "scripts_job_runners",
    Base.metadata,
    Column("script_id", ForeignKey("scripts.id"), primary_key=True),
    Column("job_runner_id", ForeignKey("job_runners.id"), primary_key=True),
)


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    script_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scripts.id", ondelete="SET NULL"), nullable=True
    )
    script_name: Mapped[str]
    script_slug: Mapped[str | None]
    job_status: Mapped[JobStatus] = mapped_column(VARCHAR)
    username: Mapped[str]
    display_name: Mapped[str | None]
    run_trigger: Mapped[str] = mapped_column(default="unknown", server_default="unknown")
    scheduled_for: Mapped[datetime.datetime | None]
    schedule_timezone: Mapped[str | None]
    schedule_author: Mapped[str | None]
    dispatch_claimed_at: Mapped[datetime.datetime | None]
    office: Mapped[str]
    repo_path: Mapped[str]
    config_version: Mapped[int] = mapped_column(default=1, server_default="1")
    runtime: Mapped[str] = mapped_column(default="python", server_default="python")
    command_args: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, server_default="{}"
    )
    execution_type: Mapped[str | None]
    command_mode: Mapped[str] = mapped_column(default="arguments", server_default="arguments")
    shell_command: Mapped[str | None]
    created_time: Mapped[datetime.datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    run_time: Mapped[Optional[datetime.datetime]]
    end_time: Mapped[Optional[datetime.datetime]]
    job_runner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_runners.id")
    )
    external_job_id: Mapped[Optional[str]]
    log_group: Mapped[str | None]
    log_stream: Mapped[str | None]
    batch_status: Mapped[str | None]
    batch_status_reason: Mapped[str | None]
    batch_details_time: Mapped[datetime.datetime | None]
    batch_checked_at: Mapped[datetime.datetime | None]

    script: Mapped["ScriptModel | None"] = relationship("ScriptModel", lazy="selectin")


class JobRunnerModel(Base):
    __tablename__ = "job_runners"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str]
    label: Mapped[str]
    description: Mapped[str]
    active: Mapped[bool]
    created_time: Mapped[datetime.datetime]

    scripts: Mapped[list["ScriptModel"]] = relationship(
        secondary=scripts_job_runners, back_populates="job_runners"
    )


class ScriptModel(Base):
    __tablename__ = "scripts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    office: Mapped[str]
    name: Mapped[str]
    slug: Mapped[str]
    description: Mapped[str]
    repo_path: Mapped[str]
    config_version: Mapped[int] = mapped_column(default=1, server_default="1")
    runtime: Mapped[str] = mapped_column(default="python", server_default="python")
    command_args: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, server_default="{}"
    )
    execution_type: Mapped[str]
    command_mode: Mapped[str] = mapped_column(default="arguments", server_default="arguments")
    shell_command: Mapped[str | None]
    schedule_enabled: Mapped[bool] = mapped_column(
        default=False, server_default="false"
    )
    schedule_type: Mapped[str] = mapped_column(
        default="manual", server_default="manual"
    )
    schedule_minute: Mapped[int | None]
    schedule_cron: Mapped[str | None]
    schedule_timezone: Mapped[str] = mapped_column(default="UTC", server_default="UTC")
    schedule_updated_by: Mapped[str | None]
    schedule_updated_name: Mapped[str | None]
    schedule_updated_at: Mapped[datetime.datetime | None]
    schedule_error: Mapped[str | None]
    active: Mapped[bool]
    roles: Mapped[list[str]] = mapped_column(ARRAY(String))
    created_time: Mapped[datetime.datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    updated_time: Mapped[datetime.datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    job_runners: Mapped[list["JobRunnerModel"]] = relationship(
        secondary=scripts_job_runners, lazy="selectin", back_populates="scripts"
    )
