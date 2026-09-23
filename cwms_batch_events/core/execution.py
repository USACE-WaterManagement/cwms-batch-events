"""Version boundary for saved configurations and immutable queued execution snapshots."""
from pathlib import PurePosixPath
from typing import Literal

CURRENT_CONFIG_VERSION = 3

from cwms_batch_events.core.models import ExecutionOptions, ExecutionRecord


class UnsupportedConfigVersion(ValueError):
    def __init__(self, version):
        super().__init__(f"Unsupported script configuration schema version {version}. Supported versions: 1, 2, 3.")


def execution_for_config(config) -> ExecutionRecord:
    """Validate without changing the saved record. Missing versions predate versioning."""
    version = getattr(config, "config_version", 1)
    if type(version) is not int or version not in (1, 2, 3):
        raise UnsupportedConfigVersion(version)
    if version in (2, 3):
        return ExecutionOptions.model_validate(config, from_attributes=True)

    path = config.repo_path
    if not isinstance(path, str) or not path.strip() or "\x00" in path:
        raise ValueError("A legacy Python script path without NUL characters is required")
    # Before 3c830a4, both runners always used Python, ignored execution_type,
    # and had no runtime/command_args. Do not apply v2 path normalization here.
    return ExecutionRecord(config_version=1, repo_path=path)


def upgrade_execution(config, target_version=CURRENT_CONFIG_VERSION) -> ExecutionOptions:
    """Apply known adjacent upgrades to a copy, never to the saved record."""
    options = execution_for_config(config)
    if target_version != CURRENT_CONFIG_VERSION or options.config_version == 1:
        raise ValueError("Legacy scripts must be reviewed and saved in Scripts Manager before upgrading")
    while options.config_version < target_version:
        upgrade = EXECUTION_UPGRADES.get(options.config_version)
        if upgrade is None:
            raise UnsupportedConfigVersion(options.config_version)
        options = upgrade(options)
    return ExecutionOptions.model_validate(options)


def _upgrade_v2_to_v3(options):
    return ExecutionOptions(**{**options.model_dump(by_alias=False), "config_version": 3})


EXECUTION_UPGRADES = {2: _upgrade_v2_to_v3}


def command_for_v1(options: ExecutionRecord, runner: Literal["batch", "local"]):
    # Reproduce 3c830a4^ exactly: AWS received argv; Docker received a string
    # (split by the Docker SDK). Even duplicate slashes and dot segments matter.
    if runner == "local":
        return f"python /jobs/{options.repo_path}"
    return ["python", f"/jobs/{options.repo_path}"]


def command_for_v2(options: ExecutionOptions) -> list[str]:
    if options.execution_type == "command":
        return [options.repo_path, *options.command_args]

    path = PurePosixPath(options.repo_path)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Repository paths must stay within /jobs")
    prefix = {"python": ["python"], "java": ["java", "-jar"], "shell": ["bash"]}
    return [*prefix[options.runtime], f"/jobs/{path}", *options.command_args]


def command_for_payload(payload, *, runner: Literal["batch", "local"] = "batch") -> list[str] | str:
    options = execution_for_config(payload)
    if options.config_version == 1:
        return command_for_v1(options, runner)
    if options.config_version == 3 and options.command_mode == "shell":
        return ["bash", "-c", options.shell_command]
    return command_for_v2(options)


def skips_repository_checkout(payload) -> bool:
    return execution_for_config(payload).execution_type == "command"
