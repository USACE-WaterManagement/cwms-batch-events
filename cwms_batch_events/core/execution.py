from pathlib import PurePosixPath

from cwms_batch_events.core.models import ExecutionOptions


def command_for_payload(payload) -> list[str]:
    options = ExecutionOptions.model_validate(payload.model_dump(by_alias=False))
    if options.execution_type == "command":
        return [options.repo_path, *options.command_args]

    path = PurePosixPath(options.repo_path)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Repository paths must stay within /jobs")
    prefix = {"python": ["python"], "java": ["java", "-jar"], "shell": ["bash"]}
    return [*prefix[options.runtime], f"/jobs/{path}", *options.command_args]
