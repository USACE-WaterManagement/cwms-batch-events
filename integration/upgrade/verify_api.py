"""Exercise real API/ORM/database paths; isolate only authentication and queue delivery."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fastapi.testclient import TestClient
from sqlalchemy import text
from cwms_batch_events.api.main import app
from cwms_batch_events.api.dependencies import get_current_user, get_job_queue
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import engine
from cwms_batch_events.core.queue import JobQueue


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
            job_id = jobs.json()[0]["id"]
            assert client.get(f"/jobs/{job_id}").status_code == 200
            for suffix in (2, 3):
                response = client.post("/jobs", json={"scriptId": f"10000000-0000-0000-0000-{suffix:012d}"})
                assert response.status_code == 422, response.text
            with engine.connect() as connection:
                assert connection.scalar(text("SELECT count(*) FROM events.jobs")) == 1
            assert not queue.messages
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
        response = client.post("/jobs", json={"scriptId": script_id})
        assert response.status_code == 200, response.text
        assert len(queue.messages) == 1
        assert queue.messages[0].payload.runtime == "shell"
        assert queue.messages[0].payload.command_args == ["two words"]
        assert client.get(f"/jobs/{response.json()['id']}").status_code == 200
        print(f"PASS: {sys.argv[1]} API compatibility checks")


if __name__ == "__main__":
    main()
