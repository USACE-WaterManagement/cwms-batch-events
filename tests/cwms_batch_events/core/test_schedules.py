import pytest
from zoneinfo import ZoneInfo
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


@pytest.mark.parametrize("year,month,day", [(2026, 2, 28), (2028, 2, 29), (2026, 4, 30), (2026, 5, 31)])
def test_monthly_last_day_fallback_preserves_advanced_cron(year, month, day):
    from datetime import datetime, timezone
    from cwms_batch_events.core.schedules import is_due
    script = ScriptCreate(**make_script_create_payload(configVersion=4, scheduleEnabled=True,
        scheduleType="monthly", scheduleCron="30 8 31 * *", scheduleTimezone="America/Chicago"))
    due = datetime(year, month, day, 8, 30, tzinfo=ZoneInfo("America/Chicago")).astimezone(timezone.utc)
    assert is_due(script, due)
    assert not is_due(script, due.replace(minute=29))
    script.schedule_type = "cron"
    assert is_due(script, due) == (day == 31)


@pytest.mark.parametrize("expression", ["0 8 * * *", "0 8 1,31 * *", "0 8 31 2 *"])
def test_monthly_rejects_non_monthly_shape(expression):
    with pytest.raises(ValidationError):
        ScriptCreate(**make_script_create_payload(configVersion=4, scheduleType="monthly", scheduleCron=expression))
