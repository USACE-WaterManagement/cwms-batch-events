from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from cwms_batch_events.core.execution import command_for_payload, execution_for_config, upgrade_execution, skips_repository_checkout
from cwms_batch_events.core.models import ExecutionOptions, ScriptRunOptions


@pytest.mark.parametrize("source", ["command", "github_file"])
def test_v2_upgrade_preserves_exact_argv_and_source(source):
    saved = SimpleNamespace(config_version=2, execution_type=source, runtime="python",
                            repo_path="echo" if source == "command" else "python/report.py",
                            command_args=["two words", "", "space ", "$HOME", "&&"])
    before = command_for_payload(saved)
    upgraded = upgrade_execution(saved)
    assert upgraded.config_version == 3
    assert upgraded.command_mode == "arguments"
    assert command_for_payload(upgraded) == before
    assert saved.config_version == 2
    assert skips_repository_checkout(upgraded) == (source == "command")
    assert upgrade_execution(upgraded) == upgraded


@pytest.mark.parametrize("source", ["command", "github_file"])
def test_shell_command_is_one_bash_argument_and_keeps_source_setup(source):
    command = "printf '%s\\n' 'two words' && false || printf 'fallback\\n'   "
    payload = ScriptRunOptions(config_version=3, office="swt", script_slug="test",
        execution_type=source, repo_path="echo", command_mode="shell", shell_command=command)
    for runner in ("batch", "local"):
        assert command_for_payload(payload, runner=runner) == ["bash", "-c", command]
    assert skips_repository_checkout(payload) == (source == "command")
    assert ScriptRunOptions.model_validate_json(payload.model_dump_json()).shell_command == command


@pytest.mark.parametrize("fields", [
    dict(config_version=2, command_mode="shell", shell_command="echo test"),
    dict(config_version=3, command_mode="shell", shell_command=" "),
    dict(config_version=3, command_mode="shell", shell_command="echo\x00test"),
    dict(config_version=3, command_mode="shell", shell_command="echo test", command_args=["unexpected"]),
    dict(config_version=3, command_mode="arguments", shell_command="echo ignored"),
    dict(config_version=3, command_mode="unknown"),
])
def test_invalid_or_ambiguous_execution_is_rejected(fields):
    with pytest.raises(ValidationError):
        ExecutionOptions(repo_path="echo", **fields)


def test_v1_cannot_be_automatically_upgraded():
    with pytest.raises(ValueError, match="reviewed"):
        upgrade_execution(SimpleNamespace(repo_path="report.py"))
    assert execution_for_config(SimpleNamespace(repo_path="report.py")).config_version == 1
