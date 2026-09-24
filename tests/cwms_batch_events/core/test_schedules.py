import pytest
from pydantic import ValidationError

from cwms_batch_events.core.models import ScriptCreate
from tests.factories import make_script_create_payload


@pytest.mark.parametrize(
    "changes",
    [
        {"scheduleType": "manual"},
        {"scheduleType": "hourly"},
        {"scheduleType": "hourly", "scheduleMinute": 60},
        {"scheduleType": "cron", "scheduleCron": "0 9 * *"},
        {"scheduleType": "cron", "scheduleCron": "99 9 * * *"},
        {"scheduleType": "cron", "scheduleCron": "*/0 9 * * *"},
        {"scheduleType": "cron", "scheduleCron": "0 9 * * 5-1"},
        {"scheduleType": "cron", "scheduleCron": "0 9 * * 1,99"},
        {
            "scheduleType": "cron",
            "scheduleCron": "0 9 * * *",
            "scheduleTimezone": "Mars/Base",
        },
    ],
)
def test_reject_invalid_enabled_schedule(changes):
    with pytest.raises(ValidationError):
        ScriptCreate(**make_script_create_payload(scheduleEnabled=True, **changes))


def test_hourly_schedule_and_legacy_defaults():
    legacy = ScriptCreate(**make_script_create_payload())
    assert not legacy.schedule_enabled
    assert legacy.schedule_timezone == "UTC"
    scheduled = ScriptCreate(
        **make_script_create_payload(
            scheduleEnabled=True,
            scheduleType="hourly",
            scheduleMinute=15,
            scheduleTimezone="America/Chicago",
        )
    )
    assert scheduled.schedule_minute == 15
    assert scheduled.schedule_timezone == "America/Chicago"


def test_cron_normalization():
    script = ScriptCreate(
        **make_script_create_payload(
            scheduleEnabled=True,
            scheduleType="cron",
            scheduleCron="  */15  8-17 * * 1-5  ",
        )
    )
    assert script.schedule_cron == "*/15 8-17 * * 1-5"
