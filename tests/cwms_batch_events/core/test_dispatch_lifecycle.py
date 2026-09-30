from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from cwms_batch_events.core.dispatch import expire_dispatch
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.maintenance import expire_unlinked_dispatches
from cwms_batch_events.core.models import JobStatus

NOW = datetime.now(timezone.utc)


def database(**changes):
    job = SimpleNamespace(**(dict(id=uuid4(), job_status=JobStatus.PENDING, external_job_id=None,
        created_time=NOW - timedelta(hours=2), dispatch_claimed_at=None,
        batch_status_reason=None, end_time=None) | changes))
    db = PostgresJobDatabase(Mock())
    db._load_job_for_update = Mock(return_value=job)
    return db, job


def test_expiry_is_unknown_not_runtime_failure():
    db, job = database()
    assert expire_dispatch(job, NOW, 60)
    assert job.job_status == JobStatus.DISPATCH_UNKNOWN
    assert job.end_time is None
    assert 'before rerunning' in job.batch_status_reason
    assert not expire_dispatch(job, NOW, 60)
    assert db.claim_dispatch(job.id)['claimed'] is False


@pytest.mark.parametrize('changes', [
    {'external_job_id': 'batch-id'}, {'job_status': JobStatus.RUNNING},
    {'job_status': JobStatus.COMPLETED}, {'job_status': JobStatus.FAILED},
    {'created_time': NOW}, {'dispatch_claimed_at': NOW},
])
def test_expiry_leaves_linked_active_terminal_and_recent_dispatches_alone(changes):
    _, job = database(**changes)
    assert not expire_dispatch(job, NOW, 60)


def test_manual_dispatch_claims_once_and_duplicate_waits_for_outcome():
    db, job = database(created_time=NOW)
    assert db.claim_dispatch(job.id)['claimed']
    result = db.claim_dispatch(job.id)
    assert not result['claimed']
    assert result['status'] == JobStatus.PENDING
    assert not result['external_job_id']


def test_late_link_recovers_unknown_without_fabricated_runtime():
    db, job = database()
    expire_dispatch(job, NOW, 60)
    db.bind_external_job_id(job.id, 'batch-id')
    assert job.external_job_id == 'batch-id'
    assert job.job_status == JobStatus.PENDING
    assert job.batch_status_reason is None
    assert job.end_time is None


@pytest.mark.parametrize('status', [JobStatus.PENDING, JobStatus.DISPATCH_UNKNOWN])
def test_rejection_commits_reason_and_end_time_once(status):
    db, job = database(job_status=status)
    db.fail_dispatch(job.id, 'No active job definition')
    ended = job.end_time
    assert job.job_status == JobStatus.FAILED
    assert ended is not None
    db.fail_dispatch(job.id, 'Duplicate callback')
    assert job.batch_status_reason == 'No active job definition'
    assert job.end_time == ended
    db.db.commit.assert_called()


@pytest.mark.parametrize('changes', [
    {'external_job_id': 'batch-id'}, {'job_status': JobStatus.RUNNING},
    {'job_status': JobStatus.COMPLETED},
])
def test_failure_callback_does_not_overwrite_newer_runtime(changes):
    db, job = database(**changes)
    before = vars(job).copy()
    db.fail_dispatch(job.id, 'Late rejection')
    assert vars(job) == before


def test_watchdog_bounds_scan_to_old_unlinked_batch_jobs_and_locks_rows():
    _, job = database()
    session = MagicMock()
    session.scalars.return_value.all.return_value = [job]
    factory = MagicMock()
    factory.return_value.__enter__.return_value = session
    with patch('cwms_batch_events.core.maintenance._begin', return_value=True):
        expire_unlinked_dispatches(NOW, factory)
    query = session.scalars.call_args.args[0]
    sql = str(query.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
    assert "job_runners.slug = 'batch'" in sql
    assert 'external_job_id IS NULL' in sql
    assert "job_status = 'Pending'" in sql
    assert 'LIMIT 100' in sql and 'FOR UPDATE SKIP LOCKED' in sql
    assert job.job_status == JobStatus.DISPATCH_UNKNOWN

def test_watchdog_runs_when_scheduler_is_disabled():
    import asyncio
    from cwms_batch_events.core.maintenance import lifespan

    async def run():
        started = asyncio.Event()
        seen = {}
        async def worker(stop, tasks):
            seen.update(tasks)
            started.set()
            await stop.wait()
        settings = SimpleNamespace(scheduler_enabled=False, dispatch_watchdog_enabled=True)
        with patch('cwms_batch_events.core.maintenance.get_settings', return_value=settings), patch('cwms_batch_events.core.maintenance.supervise', side_effect=worker):
            async with lifespan(None):
                await asyncio.wait_for(started.wait(), 1)
        assert set(seen) == {'dispatch_watchdog'}
    asyncio.run(run())


def test_expired_unclaimed_message_cannot_dispatch_before_watchdog_tick():
    db, job = database()
    result = db.claim_dispatch(job.id)
    assert not result['claimed']
    assert result['status'] == JobStatus.DISPATCH_UNKNOWN
    assert job.dispatch_claimed_at is None
