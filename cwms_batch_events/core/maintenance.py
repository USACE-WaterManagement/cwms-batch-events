"""API-owned scheduling and durable queue delivery, coordinated by PostgreSQL."""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import timedelta
from uuid import uuid4

import boto3
from botocore.config import Config
from sqlalchemy import select, text

from cwms_batch_events.core.execution import execution_for_config
from cwms_batch_events.core.job_database.postgres.models import JobModel, ScriptModel
from cwms_batch_events.core.job_database.postgres.session import create_session
from cwms_batch_events.core.models import JobMessage, JobRequestedBy, JobSource, JobStatus, ScriptRunOptions
from cwms_batch_events.core.schedules import due_minutes, validate_schedule_interval
from cwms_batch_events.core.settings import get_settings
from cwms_batch_events.core.utils import get_runner_id

logger = logging.getLogger(__name__)
TASK_LOCKS = {"schedules": 730181, "queue_delivery": 730182}


def _begin(db, task):
    db.execute(text("SET LOCAL statement_timeout = '15s'"))
    db.execute(text("SET LOCAL lock_timeout = '2s'"))
    return db.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": TASK_LOCKS[task]})


def register_due_jobs(now=None, session_factory=create_session):
    with session_factory() as db, db.begin():
        if not _begin(db, "schedules"):
            return
        now = now or db.scalar(text("SELECT CURRENT_TIMESTAMP"))
        last = db.scalar(text("SELECT last_checked FROM maintenance_tasks WHERE name='schedules'"))
        scripts = db.scalars(select(ScriptModel).where(
            ScriptModel.active.is_(True), ScriptModel.schedule_enabled.is_(True),
            ScriptModel.config_version == 4,
            ScriptModel.schedule_updated_by.is_not(None),
        ).order_by(ScriptModel.id).with_for_update()).all()
        count = 0
        for script in scripts:
            # A malformed registration must not stop other offices' schedules.
            try:
                with db.begin_nested():
                    script.schedule_error = None
                    if script.schedule_type == "cron":
                        validate_schedule_interval(script.schedule_cron)
                    options = execution_for_config(script)
                    for minute in due_minutes(script, last, now):
                        existing = db.scalar(select(JobModel.id).where(
                            JobModel.script_id == script.id, JobModel.scheduled_for == minute))
                        if existing:
                            continue
                        job = JobModel(
                            id=uuid4(), script_id=script.id, script_name=script.name,
                            script_slug=script.slug, job_status=JobStatus.PENDING,
                            username="batch-events-scheduler", display_name="Batch Events scheduler",
                            run_trigger="scheduled", office=script.office, job_runner_id=get_runner_id(),
                            scheduled_for=minute, schedule_timezone=script.schedule_timezone,
                            schedule_author=script.schedule_updated_name,
                            **options.model_dump(by_alias=False),
                        )
                        db.add(job)
                        db.flush()
                        payload = ScriptRunOptions(office=script.office.lower(), script_slug=script.slug,
                                                   **options.model_dump(by_alias=False))
                        message = JobMessage(version="1.0", job_id=job.id,
                            runner_type=get_settings().default_job_runner,
                            requested_by=JobRequestedBy(username=job.username, source=JobSource.SCHEDULER),
                            created_at=now, payload=payload)
                        db.execute(text("INSERT INTO job_outbox(job_id, payload) VALUES (:id, CAST(:payload AS jsonb))"),
                                   {"id": job.id, "payload": message.model_dump_json()})
                        count += 1
                        logger.info("Scheduled occurrence registered", extra={"event": "scheduled_job_registered",
                            "job_id": job.id, "script_id": script.id, "office": script.office,
                            "run_trigger": "scheduled", "scheduled_for": minute, "submitted_by": script.schedule_updated_name})
            except Exception as exc:
                script.schedule_error = "Schedule could not be evaluated. Review the saved command and schedule."
                if isinstance(exc, ValueError) and "minimum schedule interval" in str(exc):
                    script.schedule_error = "The minimum schedule interval is 5 minutes. Update this schedule before it can run."
                logger.exception("Schedule could not be evaluated", extra={"event": "schedule_failed", "script_id": script.id, "office": script.office})
        db.execute(text("UPDATE maintenance_tasks SET last_success=:now, last_checked=:now WHERE name='schedules'"), {"now": now})
        if last and now - last > timedelta(minutes=5):
            logger.warning("Scheduler downtime exceeded five-minute catch-up window; older occurrences skipped", extra={"event": "schedule_window_skipped"})
        logger.debug("Schedule scan complete", extra={"event": "maintenance_tick", "task": "schedules", "count": count})


def _queue():
    settings = get_settings()
    client = boto3.client("sqs", endpoint_url=settings.sqs_endpoint_url,
        config=Config(connect_timeout=3, read_timeout=5, retries={"total_max_attempts": 1}))
    url = client.get_queue_url(QueueName="cwms-batch-events")["QueueUrl"]
    return client, url


def deliver_pending_jobs(now=None, session_factory=create_session, queue_factory=_queue):
    with session_factory() as db, db.begin():
        if not _begin(db, "queue_delivery"):
            return
        now = now or db.scalar(text("SELECT CURRENT_TIMESTAMP"))
        pending = db.execute(text("""SELECT job_id, payload, attempts FROM job_outbox
            WHERE sent_at IS NULL AND next_attempt <= :now
            ORDER BY next_attempt, job_id LIMIT 50 FOR UPDATE SKIP LOCKED"""), {"now": now}).mappings().all()
        if pending:
            client, url = queue_factory()
            deadline = time.monotonic() + 10
            for row in pending:
                if time.monotonic() >= deadline:
                    break
                try:
                    # At-least-once delivery. Dispatcher claims each scheduled job
                    # before AWS submission, including retries after uncertain sends.
                    client.send_message(QueueUrl=url, MessageBody=json.dumps(row["payload"]))
                    db.execute(text("UPDATE job_outbox SET sent_at=:now, attempts=attempts+1 WHERE job_id=:id"), {"now": now, "id": row["job_id"]})
                    logger.info("Scheduled job queued", extra={"event": "scheduled_job_queued", "job_id": row["job_id"], "run_trigger": "scheduled"})
                except Exception:
                    delay = min(300, 15 * 2 ** min(row["attempts"], 5))
                    db.execute(text("UPDATE job_outbox SET attempts=attempts+1, next_attempt=:retry WHERE job_id=:id"),
                               {"id": row["job_id"], "retry": now + timedelta(seconds=delay)})
                    logger.exception("Scheduled queue delivery will retry", extra={"event": "scheduled_queue_retry", "job_id": row["job_id"], "attempts": row["attempts"] + 1})
        db.execute(text("UPDATE maintenance_tasks SET last_success=:now WHERE name='queue_delivery'"), {"now": now})


async def supervise(stop, tasks=None, interval=15):
    """One bounded worker per task; never spawn replacements for a hung thread."""
    tasks = tasks or {"schedules": register_due_jobs, "queue_delivery": deliver_pending_jobs}
    running = {}
    started = {}
    while not stop.is_set():
        for name, callback in tasks.items():
            previous = running.get(name)
            if previous and not previous.done():
                if asyncio.get_running_loop().time() - started[name] > 120:
                    logger.error("Maintenance task is stalled", extra={"event": "maintenance_stalled", "task": name})
                continue
            if previous:
                try:
                    previous.result()
                except Exception:
                    logger.exception("Maintenance task failed; watchdog is restarting it", extra={"event": "maintenance_restarted", "task": name})
            running[name] = asyncio.create_task(asyncio.to_thread(callback))
            started[name] = asyncio.get_running_loop().time()
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except TimeoutError:
            pass
    if running:
        done, pending = await asyncio.wait(running.values(), timeout=30)
        for task in done:
            if not task.cancelled():
                task.exception()
        for task in pending:
            task.cancel()


@asynccontextmanager
async def lifespan(app):
    stop = asyncio.Event()
    worker = None
    if get_settings().scheduler_enabled:
        worker = asyncio.create_task(supervise(stop))
    try:
        yield
    finally:
        stop.set()
        if worker:
            await worker
