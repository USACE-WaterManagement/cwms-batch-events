import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from threading import Event
from uuid import uuid4

from cwms_batch_events.core.schedules import due_minutes, is_due
from cwms_batch_events.core.maintenance import supervise
from cwms_batch_events.lambdas.dispatch_job.dispatcher import _dispatch_and_bind


def script(**changes):
    return SimpleNamespace(**dict(schedule_type="cron", schedule_cron="30 1 * * *",
        schedule_timezone="America/Chicago", schedule_updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        schedule_minute=30) | changes)


def test_dst_repeated_time_runs_once_and_spring_gap_never_matches():
    fall = script()
    assert is_due(fall, datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc))
    assert not is_due(fall, datetime(2026, 11, 1, 7, 30, tzinfo=timezone.utc))
    spring = script(schedule_cron="30 2 * * *")
    start = datetime(2026, 3, 8, tzinfo=timezone.utc)
    assert not any(is_due(spring, start + timedelta(minutes=n)) for n in range(1440))


def test_catchup_is_bounded_and_never_predates_schedule_edit():
    now = datetime(2026, 9, 24, 12, 10, 30, tzinfo=timezone.utc)
    every_minute = script(schedule_cron="* * * * *")
    assert len(list(due_minutes(every_minute, now - timedelta(days=2), now))) == 5
    every_minute.schedule_updated_at = now - timedelta(seconds=90)
    assert list(due_minutes(every_minute, now - timedelta(days=2), now)) == [
        now.replace(minute=9, second=0), now.replace(second=0)]


def test_cron_sunday_alias_and_day_or_semantics():
    sunday = datetime(2026, 9, 27, 12, tzinfo=timezone.utc)
    assert is_due(script(schedule_timezone="UTC", schedule_cron="0 12 1 * 7"), sunday)
    assert not is_due(script(schedule_timezone="UTC", schedule_cron="0 12 * * 1-5"), sunday)


def test_watchdog_recovers_exception_and_keeps_other_task_running():
    async def run():
        stop = asyncio.Event()
        calls = []
        def flaky():
            calls.append("flaky")
            if calls.count("flaky") == 1:
                raise RuntimeError("temporary failure")
        def healthy():
            calls.append("healthy")
        task = asyncio.create_task(supervise(stop, {"flaky": flaky, "healthy": healthy}, interval=.01))
        for _ in range(200):
            await asyncio.sleep(.01)
            if calls.count("flaky") >= 2:
                break
        stop.set()
        await task
        assert calls.count("flaky") >= 2
        assert "healthy" in calls
    asyncio.run(run())


def test_duplicate_scheduled_message_never_submits_to_batch():
    message = SimpleNamespace(job_id=uuid4(), requested_by=SimpleNamespace(source="scheduler"))
    response = Mock()
    response.json.return_value = {"claimed": False}
    with patch("cwms_batch_events.lambdas.dispatch_job.dispatcher.requests.post", return_value=response), patch("cwms_batch_events.lambdas.dispatch_job.dispatcher.dispatch_job") as dispatch:
        _dispatch_and_bind(message, {})
    dispatch.assert_not_called()


def test_watchdog_never_overlaps_a_stuck_worker():
    async def run():
        stop = asyncio.Event()
        release = Event()
        calls = []
        def blocked():
            calls.append("blocked")
            release.wait(timeout=2)
        def healthy():
            calls.append("healthy")
        task = asyncio.create_task(supervise(stop, {"blocked": blocked, "healthy": healthy}, interval=.01))
        for _ in range(100):
            await asyncio.sleep(.01)
            if calls.count("healthy") >= 3:
                break
        stop.set()
        release.set()
        await task
        assert calls.count("blocked") == 1
        assert calls.count("healthy") >= 3
    asyncio.run(run())


def test_claim_failure_never_submits_to_batch():
    message = SimpleNamespace(job_id=uuid4(), requested_by=SimpleNamespace(source="scheduler"))
    response = Mock()
    response.raise_for_status.side_effect = RuntimeError("claim unavailable")
    with patch("cwms_batch_events.lambdas.dispatch_job.dispatcher.requests.post", return_value=response), patch("cwms_batch_events.lambdas.dispatch_job.dispatcher.dispatch_job") as dispatch:
        try:
            _dispatch_and_bind(message, {})
        except RuntimeError:
            pass
        else:
            raise AssertionError("Claim must succeed before dispatch")
    dispatch.assert_not_called()
