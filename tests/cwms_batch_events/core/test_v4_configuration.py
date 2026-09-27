from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from cwms_batch_events.core.execution import command_for_payload, upgrade_saved_configuration, upgrade_execution
from cwms_batch_events.core.models import ScriptCreate, ScriptUpdate


@pytest.mark.parametrize("version", [2, 3, 4])
def test_explicit_upgrade_keeps_exact_command_and_is_idempotent(version):
    saved = SimpleNamespace(config_version=version, repo_path="echo", execution_type="command",
                            command_args=["two words", "", "$HOME", "&&"])
    upgraded = upgrade_saved_configuration(saved)
    assert upgraded.config_version == 4
    assert command_for_payload(upgraded) == command_for_payload(saved)
    assert upgrade_saved_configuration(upgraded) == upgraded
    assert saved.config_version == version


def test_shell_upgrade_preserves_command_bytes():
    saved = SimpleNamespace(config_version=3, repo_path="", command_mode="shell",
                            shell_command="echo first && echo second  ", execution_type="command")
    assert command_for_payload(upgrade_saved_configuration(saved)) == command_for_payload(saved)


def test_legacy_upgrade_keeps_effective_python_execution():
    saved = SimpleNamespace(config_version=1, repo_path="python/report.py", runtime="java",
                            execution_type="command", command_args=["ignored"])
    upgraded = upgrade_saved_configuration(saved)
    assert upgraded.runtime == "python" and upgraded.command_args == []
    assert command_for_payload(upgraded) == command_for_payload(saved)


@pytest.mark.parametrize("path", ["/jobs/report.py", "../report.py", "two words.py"])
def test_ambiguous_legacy_paths_are_not_silently_changed(path):
    with pytest.raises(ValueError, match="administrator review"):
        upgrade_saved_configuration(SimpleNamespace(config_version=1, repo_path=path))


@pytest.mark.parametrize("model", [ScriptCreate, ScriptUpdate])
@pytest.mark.parametrize("version", [2, 3])
def test_scheduling_requires_v4_but_old_manual_configs_still_work(model, version):
    fields = dict(office="SWT", name="Report", description="", repo_path="report.py", config_version=version)
    assert model(**fields).config_version == version
    with pytest.raises(ValidationError, match="Scheduling requires configuration version 4"):
        model(**fields, schedule_type="hourly", schedule_minute=5)


def test_old_upgrade_and_run_api_cannot_downgrade_v4():
    with pytest.raises(ValueError, match="cannot be downgraded"):
        upgrade_execution(SimpleNamespace(config_version=4, repo_path="report.py"), 3)
