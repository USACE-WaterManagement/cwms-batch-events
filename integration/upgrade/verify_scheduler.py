"""Real PostgreSQL coordination/outbox checks; SQS delivery is a controlled fake."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select, text
from fastapi.testclient import TestClient
from cwms_batch_events.api.main import app
from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.models import JobModel, ScriptModel
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.job_database.postgres.session import create_session
from cwms_batch_events.core.maintenance import register_due_jobs, deliver_pending_jobs
from cwms_batch_events.core.models import ScriptCreate, ScriptRunRequest


def main():
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    actor = User(username="scheduler-test-admin", display_name="Schedule Test Admin",
                 offices=["SWT"], admin_offices=["SWT"], roles={"SWT": ["CWMS Users"]})
    with create_session() as db:
        script = PostgresJobDatabase(db).store_script(ScriptCreate(
            office="SWT", name="Scheduler integration " + uuid4().hex,
            description="isolated test", repo_path="python/report.py", schedule_enabled=True,
            schedule_type="cron", schedule_cron="* * * * *", schedule_timezone="America/Chicago"), actor)
    with create_session() as db, db.begin():
        db.execute(text("UPDATE scripts SET schedule_updated_at=:t WHERE id=:id"), {"t": now - timedelta(minutes=2), "id": script.id})
        db.execute(text("UPDATE maintenance_tasks SET last_checked=:t WHERE name='schedules'"), {"t": now - timedelta(minutes=1)})
    # Competing workers and repeats produce one persisted job and one outbox row.
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: register_due_jobs(now), range(2)))
    register_due_jobs(now)
    with create_session() as db:
        jobs = db.scalars(select(JobModel).where(JobModel.script_id == script.id)).all()
        assert len(jobs) == 1
        job = jobs[0]
        job_id = job.id
        assert job.run_trigger == "scheduled" and job.username == "batch-events-scheduler"
        assert job.schedule_author == "Schedule Test Admin" and job.scheduled_for == now
        assert db.scalar(text("SELECT count(*) FROM job_outbox WHERE job_id=:id"), {"id": job_id}) == 1
    class Queue:
        fail = True
        deliveries = []
        def send_message(self, **kwargs):
            if self.fail:
                raise RuntimeError("simulated SQS outage")
            self.deliveries.append(kwargs)
    queue = Queue()
    deliver_pending_jobs(now + timedelta(minutes=1), queue_factory=lambda: (queue, "local-test"))
    with create_session() as db:
        row = db.execute(text("SELECT attempts, sent_at FROM job_outbox WHERE job_id=:id"), {"id": job_id}).one()
        assert row.attempts == 1 and row.sent_at is None
    queue.fail = False
    deliver_pending_jobs(now + timedelta(minutes=2), queue_factory=lambda: (queue, "local-test"))
    deliver_pending_jobs(now + timedelta(minutes=2), queue_factory=lambda: (queue, "local-test"))
    assert len(queue.deliveries) == 1
    def claim(_):
        with create_session() as db:
            return PostgresJobDatabase(db).claim_scheduled_dispatch(job_id)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(claim, range(2))) == [False, True]
    app.dependency_overrides[get_current_user] = lambda: actor
    with TestClient(app) as client:
        # Explicit upgrades do not execute jobs, preserve commands, require an
        # office administrator, and leave old job snapshots untouched.
        legacy = client.post("/scripts", json={"office": "SWT", "name": "Upgrade " + uuid4().hex,
            "description": "", "repoPath": "echo", "executionType": "command",
            "commandArgs": ["two words", "", "$HOME"], "configVersion": 2}).json()
        legacy_id = legacy["id"]
        with create_session() as db:
            before = PostgresJobDatabase(db).create_job(ScriptRunRequest(script_id=legacy_id), actor)
        # No real queue should be invoked by this upgrade check.
        app.dependency_overrides[get_current_user] = lambda: User(username="reader", offices=["SWT"], admin_offices=[], roles={"SWT": ["CWMS Users"]})
        assert client.post(f"/scripts/{legacy_id}/upgrade").status_code == 403
        app.dependency_overrides[get_current_user] = lambda: actor
        upgraded = client.post(f"/scripts/{legacy_id}/upgrade")
        assert upgraded.status_code == 200, upgraded.text
        assert upgraded.json()["configVersion"] == 4
        assert upgraded.json()["commandArgs"] == legacy["commandArgs"]
        assert upgraded.json()["scheduleEnabled"] is False
        assert client.post(f"/scripts/{legacy_id}/upgrade").json() == upgraded.json()
        with create_session() as db:
            assert db.get(JobModel, before.id).config_version == 2
            assert len(db.scalars(select(JobModel).where(JobModel.script_id == legacy_id)).all()) == 1
        assert client.get("/scheduler/status?office=SWT").status_code == 403
        hq_admin = actor.model_copy(update={"roles": {"HQ": ["CWMS Admin"]}})
        app.dependency_overrides[get_current_user] = lambda: hq_admin
        status = client.get("/scheduler/status")
        assert status.status_code == 200 and status.json()["pendingDelivery"] == 0
        assert client.get("/scheduler/status?office=NWD").status_code == 200
        app.dependency_overrides[get_current_user] = lambda: actor
        page = client.get(f"/jobs?scriptId={script.id}&limit=10&offset=0")
        assert page.status_code == 200 and page.headers["X-Total-Count"] == "1"
        assert [row["id"] for row in page.json()] == [str(job_id)]
        assert client.get(f"/jobs?scriptId={script.id}&limit=10&offset=10").json() == []
        latest = client.get("/jobs?latestPerScript=true")
        assert latest.status_code == 200
        assert len([row for row in latest.json() if row["scriptId"] == str(script.id)]) == 1
        assert all(row["office"] == "SWT" for row in latest.json())
        history = client.get(f"/jobs/{job_id}").json()
        assert history["runTrigger"] == "scheduled" and history["scheduleAuthor"] == "Schedule Test Admin"
    app.dependency_overrides.clear()
    # Disabling a registration stops subsequent occurrences without deleting history.
    with create_session() as db, db.begin():
        db.get(ScriptModel, script.id).schedule_enabled = False
    register_due_jobs(now + timedelta(minutes=1))
    with create_session() as db:
        assert len(db.scalars(select(JobModel).where(JobModel.script_id == script.id)).all()) == 1
    print("PASS: scheduler concurrency, attribution, durable retry, dispatch deduplication, office access, and disable")


if __name__ == "__main__":
    main()
