import pytest
from uuid import uuid4

from sqlalchemy.exc import NoResultFound

from cwms_batch_events.core.models import JobSource
from tests.factories import make_job_record


def test_get_jobs_for_user_returns_jobs(client, job_db, user):
    job = make_job_record()
    job_db.get_jobs_for_user.return_value = [job]

    response = client.get("/jobs")

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(job.id)
    job_db.get_jobs_for_user.assert_called_once_with(user.username)


def test_post_job_creates_and_dispatches_message(client, job_db, job_queue):
    script_id = str(uuid4())
    job = make_job_record()
    job_db.create_job.return_value = job
    message = object()
    job_queue.create_job_message.return_value = message

    response = client.post("/jobs", json={"scriptId": script_id})

    assert response.status_code == 200
    assert response.json()["id"] == str(job.id)
    job_db.create_job.assert_called_once()
    job_queue.create_job_message.assert_called_once()
    create_call = job_queue.create_job_message.call_args
    assert create_call.args[0] == job.id
    assert create_call.args[1] == "test-user"
    assert create_call.args[2] == JobSource.API
    assert create_call.args[3].office == "swt"
    assert create_call.args[3].repo_path == job.repo_path
    assert create_call.args[3].script_slug == job.script_slug
    job_queue.send_job_message.assert_called_once_with(message)


@pytest.mark.parametrize(
    ("side_effect", "expected_status", "expected_detail_factory"),
    [
        (PermissionError("nope"), 403, lambda script_id: "nope"),
        (NoResultFound(), 404, lambda script_id: f"Script {script_id} not found"),
    ],
)
def test_post_job_maps_errors(client, job_db, side_effect, expected_status, expected_detail_factory):
    script_id = str(uuid4())
    job_db.create_job.side_effect = side_effect

    response = client.post("/jobs", json={"scriptId": script_id})

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail_factory(script_id)}


def test_get_job_by_id_returns_job(client, job_db):
    job = make_job_record()
    job_db.get_job_by_id.return_value = job

    response = client.get(f"/jobs/{job.id}")

    assert response.status_code == 200
    assert response.json()["id"] == str(job.id)
    job_db.get_job_by_id.assert_called_once_with(job.id)


def test_get_job_by_id_returns_404_when_missing(client, job_db):
    job_id = str(uuid4())
    job_db.get_job_by_id.return_value = None

    response = client.get(f"/jobs/{job_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": f"No job found for jobId '{job_id}'"}


def test_get_logs_for_job_returns_logs(client, job_logger):
    job_id = str(uuid4())
    job_logger.get_logs_for_job.return_value = "hello"

    response = client.get(f"/jobs/{job_id}/logs")

    assert response.status_code == 200
    assert response.json() == {"logs": "hello"}
    job_logger.get_logs_for_job.assert_called_once()


def test_get_logs_for_job_returns_404_when_logs_missing(client, job_logger):
    job_id = str(uuid4())
    job_logger.get_logs_for_job.side_effect = FileNotFoundError(
        f"No logs found for job {job_id}"
    )

    response = client.get(f"/jobs/{job_id}/logs")

    assert response.status_code == 404
    assert response.json() == {"detail": f"No logs found for job {job_id}"}


def test_get_logs_for_job_returns_409_when_logs_not_ready(client, job_logger):
    job_id = str(uuid4())
    job_logger.get_logs_for_job.side_effect = ValueError("No Batch job attempts found")

    response = client.get(f"/jobs/{job_id}/logs")

    assert response.status_code == 409
    assert response.json() == {
        "detail": (
            f"Logs are not available for job '{job_id}': "
            "No Batch job attempts found"
        )
    }
