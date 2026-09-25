"""Version boundary for saved configurations and immutable queued execution snapshots."""
from pathlib import PurePosixPath
from typing import Literal

CURRENT_CONFIG_VERSION = 4

from cwms_batch_events.core.models import ExecutionOptions, ExecutionRecord


class UnsupportedConfigVersion(ValueError):
    def __init__(self, version):
        super().__init__(f"Unsupported script configuration schema version {version}. Supported versions: 1, 2, 3, 4.")


def execution_for_config(config) -> ExecutionRecord:
    """Validate without changing the saved record. Missing versions predate versioning."""
    version = getattr(config, "config_version", 1)
    if type(version) is not int or version not in (1, 2, 3, 4):
        raise UnsupportedConfigVersion(version)
    if version in (2, 3, 4):
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
    if target_version not in (3, 4) or options.config_version == 1:
        raise ValueError("Legacy scripts must be reviewed and saved in Scripts Manager before upgrading")
    if options.config_version > target_version:
        raise ValueError("Configuration versions cannot be downgraded")
    while options.config_version < target_version:
        upgrade = EXECUTION_UPGRADES.get(options.config_version)
        if upgrade is None:
            raise UnsupportedConfigVersion(options.config_version)
        options = upgrade(options)
    return ExecutionOptions.model_validate(options)


def _upgrade_v2_to_v3(options):
    return ExecutionOptions(**{**options.model_dump(by_alias=False), "config_version": 3})


def _upgrade_v3_to_v4(options):
    return ExecutionOptions(**{**options.model_dump(by_alias=False), "config_version": 4})


EXECUTION_UPGRADES = {2: _upgrade_v2_to_v3, 3: _upgrade_v3_to_v4}


def upgrade_saved_configuration(config) -> ExecutionOptions:
    """Keep the effective command, including ignored legacy runtime/arguments."""
    options = execution_for_config(config)
    if options.config_version != 1:
        return upgrade_execution(options)
    path = options.repo_path
    # A historical local runner split this string on whitespace. Do not guess
    # a replacement for paths whose historical meaning differs across runners.
    if path.startswith("/") or ".." in PurePosixPath(path).parts or any(char.isspace() for char in path):
        raise ValueError("This legacy path needs administrator review. Create a version 4 replacement with a verified path. The existing script was not changed.")
    return ExecutionOptions(config_version=4, repo_path=path, runtime="python",
                            execution_type="github_file", command_args=[])


def command_for_v1(options: ExecutionRecord, runner: Literal["batch", "local"]):
    # Reproduce 3c830a4^ exactly: AWS received argv. Docker received a string
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
    # Validation above rejects unknown schemas. Supported future schemas can
    # inherit Bash mode without another version-specific dispatch branch.
    if options.config_version >= 3 and options.command_mode == "shell":
        return ["bash", "-c", options.shell_command]
    return command_for_v2(options)


def skips_repository_checkout(payload) -> bool:
    options = execution_for_config(payload)
    return options.execution_type == "command" or options.release_jar is not None
