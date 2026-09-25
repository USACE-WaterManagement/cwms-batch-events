import re
from calendar import monthrange
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def validate_cron(expression: str) -> str:
    """Validate the numeric five-field cron syntax understood by the scheduler."""
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError("scheduleCron must be a five-field cron expression")
    for field, (minimum, maximum) in zip(
        fields, [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
    ):
        for item in field.split(","):
            if not re.fullmatch(r"(?:\*|[0-9]+(?:-[0-9]+)?)(?:/[0-9]+)?", item):
                raise ValueError(f"Invalid cron field: {field}")
            base, *step = item.split("/")
            if step and int(step[0]) < 1:
                raise ValueError("Cron step must be at least 1")
            if base != "*":
                bounds = [int(value) for value in base.split("-")]
                if not minimum <= bounds[0] <= bounds[-1] <= maximum:
                    raise ValueError(f"Cron field out of range: {field}")
                if step and len(bounds) == 1:
                    raise ValueError("Use a range or * before a cron step")
    return " ".join(fields)


def field_matches(field: str, value: int, minimum: int, maximum: int) -> bool:
    for item in field.split(","):
        base, *steps = item.split("/")
        step = 1
        if steps:
            step = int(steps[0])
        if base == "*":
            start, end = minimum, maximum
        elif "-" in base:
            start, end = map(int, base.split("-"))
        else:
            start = end = int(base)
        if start <= value <= end and (value - start) % step == 0:
            return True
    return False


def is_due(script, minute: datetime) -> bool:
    local = minute.astimezone(ZoneInfo(script.schedule_timezone))
    if local.fold:
        return False
    if script.schedule_type == "hourly":
        return local.minute == script.schedule_minute
    if script.schedule_type == "monthly":
        minute_field, hour, day, _, _ = validate_cron(script.schedule_cron).split()
        last_day = monthrange(local.year, local.month)[1]
        return local.minute == int(minute_field) and local.hour == int(hour) and local.day == min(int(day), last_day)
    if script.schedule_type != "cron":
        return False
    minute_field, hour, day, month, weekday = validate_cron(script.schedule_cron).split()
    week_value = (local.weekday() + 1) % 7
    day_match = field_matches(day, local.day, 1, 31)
    week_match = field_matches(weekday, week_value, 0, 7)
    if week_value == 0:
        week_match = week_match or field_matches(weekday, 7, 0, 7)
    date_match = day_match or week_match
    if day == "*" or weekday == "*":
        date_match = day_match and week_match
    return (date_match and field_matches(minute_field, local.minute, 0, 59)
            and field_matches(hour, local.hour, 0, 23) and field_matches(month, local.month, 1, 12))


def due_minutes(script, last_checked: datetime | None, now: datetime):
    """At most five UTC minutes; edits never retroactively create occurrences."""
    end = now.astimezone(timezone.utc).replace(second=0, microsecond=0)
    start = end
    if last_checked is not None:
        start = max(end - timedelta(minutes=4), last_checked.replace(second=0, microsecond=0) + timedelta(minutes=1))
    while start <= end:
        if script.schedule_updated_at and start >= script.schedule_updated_at and is_due(script, start):
            yield start
        start += timedelta(minutes=1)


def next_run(script, after: datetime) -> datetime | None:
    """Next occurrence, using dispatcher rules; search eight years for leap days.

    Filter dates before enumerating times, so impossible cron dates are bounded.
    Round-trip local times to exclude DST gaps; only fold zero is considered.
    """
    if not script.active or not script.schedule_enabled or script.config_version != 4:
        return None
    zone = ZoneInfo(script.schedule_timezone)
    day = after.astimezone(zone).replace(hour=0, minute=0, second=0, microsecond=0)
    if script.schedule_type == "hourly":
        hours, minutes = list(range(24)), [script.schedule_minute]
    elif script.schedule_type in {"monthly", "cron"}:
        fields = validate_cron(script.schedule_cron).split()
        minutes = [v for v in range(60) if field_matches(fields[0], v, 0, 59)]
        hours = [v for v in range(24) if field_matches(fields[1], v, 0, 23)]
    else:
        return None
    for _ in range(366 * 8):
        date_matches = True
        if script.schedule_type == "monthly":
            date_matches = day.day == min(int(fields[2]), monthrange(day.year, day.month)[1])
        elif script.schedule_type == "cron":
            dom = field_matches(fields[2], day.day, 1, 31)
            weekday = (day.weekday() + 1) % 7
            dow = field_matches(fields[4], weekday, 0, 7) or (weekday == 0 and field_matches(fields[4], 7, 0, 7))
            date_matches = dom or dow
            if fields[2] == "*" or fields[4] == "*":
                date_matches = dom and dow
            date_matches = date_matches and field_matches(fields[3], day.month, 1, 12)
        if date_matches:
            for hour in hours:
                for minute in minutes:
                    local = day.replace(hour=hour, minute=minute, fold=0)
                    candidate = local.astimezone(timezone.utc)
                    if candidate <= after or candidate.astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
                        continue
                    if is_due(script, candidate):
                        return candidate
        day += timedelta(days=1)
    return None
