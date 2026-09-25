"""Loopback demo: real PostgreSQL and scheduler; simulated queue and job output.

Run python -m tools.scheduler_demo, then point Vite at http://127.0.0.1:8019.
Only the isolated batch-scheduler-demo database is used. No scripts execute.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import time


def prepare_database():
    name = "batch-scheduler-demo"
    exists = subprocess.run(["docker", "inspect", name], capture_output=True).returncode == 0
    if not exists:
        subprocess.run(["docker", "run", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=local-demo-only",
                        "-p", "127.0.0.1:55439:5432", "postgres:17"], check=True)
    else:
        subprocess.run(["docker", "start", name], check=True)
    for _ in range(30):
        if subprocess.run(["docker", "exec", name, "pg_isready", "-U", "postgres"], capture_output=True).returncode == 0:
            break
        time.sleep(1)
    root = Path(__file__).resolve().parents[1]
    subprocess.run(["docker", "build", "-t", "batch-scheduler-demo-migration", str(root / "infra/migration")], check=True)
    subprocess.run(["docker", "run", "--rm", "--network", f"container:{name}",
                    "-e", "FLYWAY_URL=jdbc:postgresql://127.0.0.1:5432/postgres",
                    "-e", "FLYWAY_USER=postgres", "-e", "FLYWAY_PASSWORD=local-demo-only",
                    "-e", "FLYWAY_DEFAULT_SCHEMA=events", "-e", "FLYWAY_PLACEHOLDERS_APP_USER=eventsapp",
                    "-e", "FLYWAY_PLACEHOLDERS_APP_PASSWORD=local-demo-only", "batch-scheduler-demo-migration", "migrate"], check=True)


def create_demo():
    # Explicit loopback-only configuration, never inherited deployment settings.
    os.environ.update(PGHOST="127.0.0.1", PGPORT="55439", PGDATABASE="postgres", PGUSER="eventsapp",
        PGPASSWORD="local-demo-only", DATABASE_SCHEMA="events", APP_KEY="local-demo-only", MOCK_USER="true",
        SCHEDULER_ENABLED="true", DEFAULT_JOB_RUNNER="batch", DEPLOYMENT_ENVIRONMENT="local",
        AWS_DEFAULT_REGION="us-gov-west-1", REPOSITORY_MOCK_MODE="true")
    from sqlalchemy import select
    from cwms_batch_events.api.main import app
    from cwms_batch_events.api.dependencies import get_current_user, get_job_queue, get_job_logger
    from cwms_batch_events.core.auth.user.models import User
    from cwms_batch_events.core.job_database.postgres.models import ScriptModel
    from cwms_batch_events.core.job_database.postgres.session import create_session
    from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
    from cwms_batch_events.core.models import JobMessage, JobLogPage, JobStatus, ScriptCreate
    from cwms_batch_events.core.queue import JobQueue
    from cwms_batch_events.core.maintenance import supervise, register_due_jobs, deliver_pending_jobs
    from cwms_batch_events.core.execution import command_for_payload
    import shlex
    actor = User(username="demo-operator", display_name="Demo Operator", offices=["SWT"],
                 admin_offices=["SWT"], roles={"SWT": ["CWMS Users"], "HQ": ["CWMS Admin"]})

    class DemoQueue(JobQueue):
        def __init__(self):
            self.runner_type = "batch"

        def send_job_message(self, message):
            with create_session() as db:
                jobs = PostgresJobDatabase(db)
                if message.requested_by.source == "scheduler" and not jobs.claim_scheduled_dispatch(message.job_id):
                    return "already-claimed"
                jobs.update_job_status(message.job_id, JobStatus.RUNNING)
                jobs.update_job_status(message.job_id, JobStatus.COMPLETED)
            return "simulated-delivery"

        def send_message(self, **kwargs):
            self.send_job_message(JobMessage.model_validate_json(kwargs["MessageBody"]))
            return {"MessageId": "simulated-delivery"}

    class DemoLogs:
        def get_logs_for_job(self, job_id):
            return self.get_log_page(job_id).logs

        def get_log_page(self, job_id, cursor=None):
            with create_session() as db:
                job = PostgresJobDatabase(db).get_job_by_id(job_id)
            command = shlex.join(command_for_payload(job))
            return JobLogPage(logs=f"LOCAL DEMO — execution is simulated.\nJob: {job.script_name}\nRun ID: {job.id}\nOffice: {job.office}\nRequested command: {command}\nTrigger: {job.run_trigger}\nSubmitted by: {job.display_name}\n\nNo command was executed. Actual help text and program output require a real job runner.\n", has_more=False, supports_live=False, reset=True)

    queue = DemoQueue()
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_job_queue] = lambda: queue
    app.dependency_overrides[get_job_logger] = lambda: DemoLogs()
    with create_session() as db:
        script = db.scalar(select(ScriptModel).where(ScriptModel.slug == "office-report-demo"))
        if script is None:
            db.rollback()
            script = PostgresJobDatabase(db).store_script(ScriptCreate(office="SWT", name="Office report demo",
                description="Local demo: real scheduling and history, simulated queue and job output. Runs every minute.",
                repo_path="python/reports/example.py", schedule_enabled=True, schedule_type="cron",
                schedule_cron="* * * * *", schedule_timezone="America/Chicago"), actor)
            saved = db.get(ScriptModel, script.id)
            saved.schedule_updated_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.commit()
    # Bring only this isolated demonstration's scheduled fixture to the current
    # version, and keep a separate old registration for reviewing the upgrade UI.
    with create_session() as db, db.begin():
        scheduled_demo = db.scalar(select(ScriptModel).where(ScriptModel.slug == "office-report-demo"))
        scheduled_demo.config_version = 4
    with create_session() as db:
        legacy_demo = db.scalar(select(ScriptModel).where(ScriptModel.slug == "configuration-upgrade-demo"))
        if legacy_demo is None:
            db.rollback()
            PostgresJobDatabase(db).store_script(ScriptCreate(office="SWT", name="Configuration upgrade demo",
                description="Version 3 sample. Use Upgrade configuration in Details, then explore scheduling.",
                config_version=3, repo_path="python/reports/example.py", command_args=["--office", "SWT"]), actor)
    @asynccontextmanager
    async def demo_lifespan(application):
        stop = asyncio.Event()
        worker = asyncio.create_task(supervise(stop, {
            "schedules": register_due_jobs,
            "queue_delivery": lambda: deliver_pending_jobs(queue_factory=lambda: (queue, "demo")),
        }))
        yield
        stop.set()
        await worker
    app.router.lifespan_context = demo_lifespan
    return app


if __name__ == "__main__":
    prepare_database()
    import uvicorn
    uvicorn.run(create_demo(), host="127.0.0.1", port=8019)
