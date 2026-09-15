"""Exercise real API/ORM/database paths; isolate only authentication and queue delivery."""
from pathlib import Path
import sys
from datetime import datetime, timezone
from unittest.mock import Mock, patch
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session
from cwms_batch_events.api.main import app
from cwms_batch_events.api.dependencies import get_current_user, get_job_queue
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import engine
from cwms_batch_events.core.queue import JobQueue
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase


class CapturedQueue(JobQueue):
    def __init__(self):
        self.messages = []
        self.runner_type = "batch"

    def send_job_message(self, message):
        self.messages.append(message)


def main():
    queue = CapturedQueue()
    app.dependency_overrides[get_current_user] = lambda: User(username="upgrade-user", offices=["SWT"],
        admin_offices=["SWT"], roles={"SWT": ["CWMS Users"]})
    app.dependency_overrides[get_job_queue] = lambda: queue
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/about/schema").status_code == 200
        scripts = client.get("/scripts?office=SWT")
        assert scripts.status_code == 200, scripts.text
        assert client.get("/scripts?office=LRH").status_code == 401
        catalog = client.get("/scripts/catalog")
        assert catalog.status_code == 200, catalog.text
        jobs = client.get("/jobs")
        assert jobs.status_code == 200, jobs.text
        if sys.argv[1] == "historical":
            assert len(scripts.json()) == 5
            assert {row["slug"] for row in catalog.json()} == {"relative", "absolute", "parent"}
            assert jobs.json()[0]["repoPath"] == "/jobs/python/report.py"
            assert jobs.json()[0]["runTrigger"] == "unknown"
            job_id = jobs.json()[0]["id"]
            assert client.get(f"/jobs/{job_id}").status_code == 200
            for suffix in (3,):
                response = client.post("/jobs", json={"scriptId": f"10000000-0000-0000-0000-{suffix:012d}"})
                assert response.status_code == 422, response.text
            with engine.connect() as connection:
                assert connection.scalar(text("SELECT count(*) FROM events.jobs")) == 1
            assert not queue.messages
            response = client.post("/jobs", json={"scriptId": "10000000-0000-0000-0000-000000000002"})
            assert response.status_code == 200, response.text
            assert len(queue.messages) == 1
            assert queue.messages[0].payload.repo_path == "python/report.py"
            queue.messages.clear()
        else:
            assert scripts.json() == [] and catalog.json() == [] and jobs.json() == []
        payload = dict(office="SWT", name="New Java registration", description="Upgrade test", repoPath="java-artifacts/report.jar",
            executionType="github_file", runtime="java", commandArgs=["two words"], active=True,
            roles=["CWMS Users"], jobRunners=["58600a09-f18e-42c5-9d3c-df52ebe409f9"])
        response = client.post("/scripts", json=payload)
        assert response.status_code == 200, response.text
        script_id = response.json()["id"]
        payload.update(runtime="shell", repoPath="bin/report.sh")
        assert client.put(f"/scripts/{script_id}", json=payload).status_code == 200
        response = client.post("/jobs", json={"scriptId": script_id, "runTrigger": "manual"})
        assert response.status_code == 200, response.text
        assert response.json()["runTrigger"] == "manual"
        assert len(queue.messages) == 1
        assert queue.messages[0].payload.runtime == "shell"
        assert queue.messages[0].payload.command_args == ["two words"]
        assert client.get(f"/jobs/{response.json()['id']}").status_code == 200
        job_id = UUID(response.json()["id"])
        with Session(engine) as session:
            PostgresJobDatabase(session).bind_external_job_id(job_id, "test-batch-id")
        batch, logs = Mock(), Mock()
        batch.describe_jobs.return_value = {"jobs": [{"status": "RUNNING",
            "container": {"logStreamName": "saved-stream"}, "startedAt": 1000}]}
        logs.get_log_events.return_value = {"events": [{"message": "retained output"}]}
        with patch("cwms_batch_events.core.job_logger.cloudwatch.boto3.client",
                   side_effect=lambda name: batch if name == "batch" else logs):
            app.dependency_overrides[get_current_user] = lambda: User(username="colleague", offices=["SWT"],
                admin_offices=[], roles={"SWT": ["CWMS Users"]})
            shared = client.get("/jobs?limit=1&offset=0")
            assert shared.status_code == 200 and shared.json()[0]["id"] == str(job_id)
            assert int(shared.headers["X-Total-Count"]) >= 1
            assert client.get(f"/jobs/{job_id}").json()["jobStatus"] == "Running"
            assert client.get(f"/jobs/{job_id}/logs/page").json()["logs"] == "retained output"
            batch.describe_jobs.assert_called_once()
            app.dependency_overrides[get_current_user] = lambda: User(username="outsider", offices=["LRH"],
                admin_offices=[], roles={"LRH": ["CWMS Users"]})
            outsider = client.get("/jobs?limit=10&offset=0")
            assert outsider.json() == [] and outsider.headers["X-Total-Count"] == "0"
            for suffix in ("", "/logs", "/logs/page"):
                assert client.get(f"/jobs/{job_id}{suffix}").status_code == 404
            app.dependency_overrides[get_current_user] = lambda: User(username="colleague", offices=["SWT"],
                admin_offices=[], roles={"SWT": ["CWMS Users"]})
            with Session(engine) as session:
                PostgresJobDatabase(session).record_batch_details(job_id,
                    {"status": "SUCCEEDED", "stoppedAt": 2000}, datetime.now(timezone.utc))
            batch.describe_jobs.return_value = {"jobs": []}
            for path in ("logs", "logs/page"):
                result = client.get(f"/jobs/{job_id}/{path}")
                assert result.status_code == 200, result.text
                assert result.json()["logs"] == "retained output"
            batch.describe_jobs.assert_called_once()
        # A session that loaded the row before another worker's claim must
        # refresh its identity-map copy under the lock before deciding.
        with engine.begin() as connection:
            connection.execute(text("UPDATE events.jobs SET batch_checked_at = NULL WHERE id = :id"), {"id": job_id})
        with Session(engine) as first, Session(engine) as second:
            from cwms_batch_events.core.job_database.postgres.models import JobModel
            stale = first.get(JobModel, job_id)
            assert stale.batch_checked_at is None
            assert PostgresJobDatabase(second).claim_batch_refresh(job_id)
            assert not PostgresJobDatabase(first).claim_batch_refresh(job_id)
        print(f"PASS: {sys.argv[1]} API compatibility checks")


if __name__ == "__main__":
    main()
