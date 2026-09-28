from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from cwms_batch_events.core.models import CamelModel, ScriptRead


PORTABLE_FIELDS = (
    "config_version", "name", "description", "repo_path", "execution_type",
    "runtime", "command_args", "command_placeholder", "command_mode",
    "shell_command", "release_jar", "environment_variables", "resource_size",
    "active", "roles", "schedule_enabled", "schedule_type", "schedule_minute",
    "schedule_cron", "schedule_timezone",
)


class ScriptConfigurationExport(CamelModel):
    """Portable, user-managed backup of a saved script configuration."""

    schema_version: Literal[1] = 1
    configuration_key: UUID
    source_office: str
    configuration: dict[str, Any]

    @classmethod
    def from_script(cls, script: ScriptRead) -> "ScriptConfigurationExport":
        return cls(
            configuration_key=script.configuration_key,
            source_office=script.office,
            configuration={
                field: script.model_dump(by_alias=False).get(field)
                for field in PORTABLE_FIELDS
            },
        )


class ScriptConfigurationImport(CamelModel):
    target_office: str = Field(min_length=1, max_length=16)
    package: ScriptConfigurationExport
    selections: dict[str, Literal["existing", "imported"]] = Field(default_factory=dict)
