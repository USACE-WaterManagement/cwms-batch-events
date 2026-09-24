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
from cwms_batch_events.api.dependencies import get_current_user, get_job_queue, get_job_logger
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import engine
from cwms_batch_events.core.queue import JobQueue
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.execution import command_for_payload
from cwms_batch_events.core.models import JobLogPage


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
            assert len(scripts.json()) == 8
            assert {row["slug"] for row in catalog.json()} == {"relative", "absolute", "parent", "dot", "jobs-prefix", "corrupt"}
            assert all(row["configVersion"] == 1 for row in scripts.json())
            assert jobs.json()[0]["configVersion"] == 1
            assert jobs.json()[0]["repoPath"] == "/jobs/python/report.py"
            assert jobs.json()[0]["runTrigger"] == "unknown"
            assert jobs.json()[0]["office"] == "SWT"
            assert jobs.json()[0]["displayName"] == "Name unavailable"
            assert "1543077719" not in jobs.text
            shared_page = client.get("/jobs?limit=10&offset=0")
            assert shared_page.headers["X-Total-Count"] == "1"
            assert shared_page.json() == jobs.json()
            job_id = jobs.json()[0]["id"]
            assert client.get(f"/jobs/{job_id}").status_code == 200
            historical_logs = Mock()
            historical_logs.get_logs_for_job.return_value = "historical output"
            historical_logs.get_log_page.return_value = JobLogPage(logs="historical output")
            app.dependency_overrides[get_job_logger] = lambda: historical_logs
            app.dependency_overrides[get_current_user] = lambda: User(username="colleague", offices=["SWT"],
                admin_offices=[], roles={"SWT": ["CWMS Users"]})
            for suffix in ("", "/logs", "/logs/page"):
                assert client.get(f"/jobs/{job_id}{suffix}").status_code == 200
            # The original submitter cannot bypass their current office access.
            app.dependency_overrides[get_current_user] = lambda: User(
                username="EXAMPLE.CHARLES.ROBERT.1543077719", offices=["LRH"],
                admin_offices=[], roles={"LRH": ["CWMS Users"]})
            hidden = client.get("/jobs?limit=10&offset=0")
            assert hidden.json() == [] and hidden.headers["X-Total-Count"] == "0"
            for suffix in ("", "/logs", "/logs/page"):
                assert client.get(f"/jobs/{job_id}{suffix}").status_code == 404
            app.dependency_overrides.pop(get_job_logger)
            app.dependency_overrides[get_current_user] = lambda: User(username="upgrade-user", offices=["SWT"],
                admin_offices=["SWT"], roles={"SWT": ["CWMS Users"]})
            for suffix in (9,):
                response = client.post("/jobs", json={"scriptId": f"10000000-0000-0000-0000-{suffix:012d}"})
                assert response.status_code == 422, response.text
            with engine.connect() as connection:
                assert connection.scalar(text("SELECT count(*) FROM events.jobs")) == 1
                original = connection.execute(text("SELECT username, office, display_name, run_trigger FROM events.jobs")).one()
                assert tuple(original) == ("EXAMPLE.CHARLES.ROBERT.1543077719", "SWT", None, "unknown")
            assert not queue.messages
            with engine.connect() as connection:
                before = connection.execute(text("SELECT * FROM events.scripts ORDER BY id")).all()
            for suffix, path in ((1, "python/report.py"), (2, "/python/run_hourly.py"),
                                 (3, "../report.py"), (7, "./python/report.py"), (8, "/jobs/python/report.py")):
                response = client.post("/jobs", json={"scriptId": f"10000000-0000-0000-0000-{suffix:012d}"})
                assert response.status_code == 200, response.text
                assert response.json()["configVersion"] == 1
                assert response.json()["repoPath"] == path
                queued = queue.messages[-1].payload
                assert queued.config_version == 1
                assert command_for_payload(queued) == ["python", f"/jobs/{path}"]
                assert command_for_payload(queued, runner="local") == f"python /jobs/{path}"
            assert len(queue.messages) == 5
            client.get("/scripts?office=SWT")
            with engine.connect() as connection:
                after = connection.execute(text("SELECT * FROM events.scripts ORDER BY id")).all()
                assert before == after, "Reads and runs must not rewrite legacy registrations"
                assert connection.scalar(text("SELECT count(*) FROM events.jobs WHERE config_version = 1")) == 6
            # PUT is a current-schema write. Omitted version defaults to v3;
            # pending jobs keep the v1 path/version even after the script changes.
            script_id = "10000000-0000-0000-0000-000000000002"
            edit = dict(name="Edited legacy", description="Current schema", repoPath="python/run_hourly.py")
            response = client.put(f"/scripts/{script_id}", json=edit)
            assert response.status_code == 200, response.text
            assert response.json()["configVersion"] == 3
            old_job = client.get(f"/jobs/{queue.messages[1].job_id}").json()
            assert old_job["configVersion"] == 1 and old_job["repoPath"] == "/python/run_hourly.py"
            assert command_for_payload(queue.messages[1].payload) == ["python", "/jobs//python/run_hourly.py"]
            queue.messages.clear()
        else:
            assert scripts.json() == [] and catalog.json() == [] and jobs.json() == []
        payload = dict(office="SWT", name="New Java registration", description="Upgrade test", repoPath="java-artifacts/report.jar",
            executionType="github_file", runtime="java", commandArgs=["two words"], active=True,
            roles=["CWMS Users"], jobRunners=["58600a09-f18e-42c5-9d3c-df52ebe409f9"])
        response = client.post("/scripts", json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["configVersion"] == 3
        script_id = response.json()["id"]
        payload.update(runtime="shell", repoPath="bin/report.sh")
        assert client.put(f"/scripts/{script_id}", json=payload).status_code == 200
        response = client.post("/jobs", json={"scriptId": script_id, "runTrigger": "manual"})
        assert response.status_code == 200, response.text
        assert response.json()["runTrigger"] == "manual"
        assert len(queue.messages) == 1
        assert queue.messages[0].payload.runtime == "shell"
        assert queue.messages[0].payload.config_version == 3
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
        queue.messages.clear()
        app.dependency_overrides[get_current_user] = lambda: User(username="upgrade-user", offices=["SWT"],
            admin_offices=["SWT"], roles={"SWT": ["CWMS Users"]})
        for runtime, path, expected in (
            ("python", "python/report.py", ["python", "/jobs/python/report.py", "two words"]),
            ("java", "lib/report.jar", ["java", "-jar", "/jobs/lib/report.jar", "two words"]),
            ("shell", "bin/report.sh", ["bash", "/jobs/bin/report.sh", "two words"]),
        ):
            payload.update(runtime=runtime, repoPath=path)
            assert client.put(f"/scripts/{script_id}", json=payload).status_code == 200
            response = client.post("/jobs", json={"scriptId": script_id})
            assert response.status_code == 200, response.text
            assert command_for_payload(queue.messages[-1].payload) == expected
        payload.update(executionType="command", repoPath="echo", commandArgs=["two words", "", "$HOME"])
        assert client.put(f"/scripts/{script_id}", json=payload).status_code == 200
        assert client.post("/jobs", json={"scriptId": script_id}).status_code == 200
        assert command_for_payload(queue.messages[-1].payload) == ["echo", "two words", "", "$HOME"]
        assert command_for_payload(queue.messages[0].payload) == ["python", "/jobs/python/report.py", "two words"]
        for path in ("../escape.py", "/python/report.py", "/jobs/../escape.py", ""):
            invalid = payload | dict(executionType="github_file", repoPath=path)
            assert client.put(f"/scripts/{script_id}", json=invalid).status_code == 422
        assert client.post("/scripts", json=payload | dict(configVersion=1)).status_code == 422
        # Exercise persisted v2-to-v3 upgrades and shell snapshots against the DB.
        v2 = payload | dict(configVersion=2, commandArgs=["two words", "space ", ""])
        assert client.put(f"/scripts/{script_id}", json=v2).status_code == 200
        v2_job = client.post("/jobs", json={"scriptId": script_id}).json()
        upgraded = client.post("/jobs", json={"scriptId": script_id, "upgradeToVersion": 3})
        assert upgraded.status_code == 200, upgraded.text
        assert upgraded.json()["configVersion"] == 3
        assert upgraded.json()["commandArgs"] == v2["commandArgs"]
        assert client.get(f"/jobs/{v2_job['id']}").json()["configVersion"] == 2
        stored = next(row for row in client.get("/scripts?office=SWT").json() if row["id"] == script_id)
        assert stored["configVersion"] == 3 and stored["commandArgs"] == v2["commandArgs"]
        assert client.post("/jobs", json={"scriptId": script_id}).json()["configVersion"] == 3
        shell = "printf 'first\\n' && false || printf 'fallback\\n'   "
        custom = client.post("/jobs", json={"scriptId": script_id, "upgradeToVersion": 3,
                                            "commandMode": "shell", "shellCommand": shell})
        assert custom.status_code == 200, custom.text
        assert client.get(f"/jobs/{custom.json()['id']}").json()["shellCommand"] == shell
        assert command_for_payload(queue.messages[-1].payload) == ["bash", "-c", shell]
        saved_shell = payload | dict(configVersion=3, commandMode="shell", shellCommand=shell, commandArgs=[])
        assert client.put(f"/scripts/{script_id}", json=saved_shell).status_code == 200
        assert client.post("/jobs", json={"scriptId": script_id}).json()["shellCommand"] == shell
        with engine.begin() as connection:
            connection.execute(text("UPDATE events.scripts SET config_version = 99 WHERE id = :id"), {"id": script_id})
            count = connection.scalar(text("SELECT count(*) FROM events.jobs"))
        queued_count = len(queue.messages)
        response = client.post("/jobs", json={"scriptId": script_id})
        assert response.status_code == 422 and "schema version 99" in response.json()["detail"]
        assert len(queue.messages) == queued_count
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM events.jobs")) == count
        print(f"PASS: {sys.argv[1]} API compatibility checks")


if __name__ == "__main__":
    main()
