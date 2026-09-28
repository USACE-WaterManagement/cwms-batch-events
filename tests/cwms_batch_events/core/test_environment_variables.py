import pytest
from pydantic import ValidationError

from cwms_batch_events.core.models import EnvironmentVariable, ScriptCreate
from tests.factories import make_script_create_payload


@pytest.mark.parametrize("name", ["OFFICE", "TZ", "BATCH_EVENTS_JOB_ID", "API_KEY", "PASSWORD_HINT"])
def test_protected_environment_names_are_rejected(name):
    with pytest.raises(ValidationError):
        EnvironmentVariable(name=name, value="value")


def test_environment_variable_names_and_values_are_preserved():
    payload = make_script_create_payload(
        environmentVariables=[{"name": "REPORT_MODE", "value": "daily"}]
    )

    script = ScriptCreate(**payload)

    assert script.environment_variables[0].name == "REPORT_MODE"
    assert script.environment_variables[0].value == "daily"


def test_duplicate_environment_variable_names_are_rejected():
    with pytest.raises(ValidationError, match="unique"):
        ScriptCreate(**make_script_create_payload(environmentVariables=[
            {"name": "REPORT_MODE", "value": "daily"},
            {"name": "REPORT_MODE", "value": "hourly"},
        ]))
