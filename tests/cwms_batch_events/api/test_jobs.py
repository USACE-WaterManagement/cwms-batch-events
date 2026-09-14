import pytest
from uuid import uuid4

from sqlalchemy.exc import NoResultFound

from cwms_batch_events.core.models import JobSource
from cwms_batch_events.core.models import JobLogPage
from tests.factories import make_job_record


def test_log_page_preserves_cursor_contract(client, job_db, job_logger, user):
    job = make_job_record(username=user.username)
    job_db.get_job_by_id.return_value = job
    job_logger.get_log_page.return_value = JobLogPage(logs="new output", next_cursor="next", has_more=True)
    response = client.get(f"/jobs/{job.id}/logs/page?cursor=previous")
    assert response.status_code == 200
    assert response.json() == dict(logs="new output", nextCursor="next", hasMore=True, reset=False, available=True, supportsLive=True, message=None)
    job_logger.get_log_page.assert_called_once_with(job.id, "previous")


@pytest.mark.parametrize("missing", [False, True])
def test_log_page_requires_job_owner(client, job_db, job_logger, missing):
    job = make_job_record(username="someone-else")
    job_db.get_job_by_id.return_value = None if missing else job
    assert client.get(f"/jobs/{job.id}/logs/page").status_code == 404
    job_logger.get_log_page.assert_not_called()


def test_log_page_rejects_invalid_and_oversized_cursor(client, job_db, job_logger, user):
    job = make_job_record(username=user.username)
    job_db.get_job_by_id.return_value = job
    job_logger.get_log_page.side_effect = ValueError("bad cursor")
    assert client.get(f"/jobs/{job.id}/logs/page?cursor=bad").status_code == 400
    assert client.get(f"/jobs/{job.id}/logs/page?cursor={'x' * 16385}").status_code == 422


def test_get_jobs_for_user_returns_jobs(client, job_db, user):
    job = make_job_record()
    job_db.get_jobs_for_user.return_value = [job]

    response = client.get("/jobs")

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(job.id)
    job_db.get_jobs_for_user.assert_called_once_with(user.username)


def test_get_jobs_page_returns_total_and_user_scoped_page(client, job_db, user):
    jobs = [make_job_record() for _ in range(10)]
    job_db.get_jobs_for_user.return_value = jobs
    job_db.count_jobs_for_user.return_value = 23

    response = client.get("/jobs?limit=10&offset=10")

    assert response.status_code == 200
    assert len(response.json()) == 10
    assert response.headers["X-Total-Count"] == "23"
    job_db.get_jobs_for_user.assert_called_once_with(user.username, limit=10, offset=10)
    job_db.count_jobs_for_user.assert_called_once_with(user.username)


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "limit=all"])
def test_get_jobs_rejects_invalid_pagination(client, job_db, query):
    assert client.get(f"/jobs?{query}").status_code == 422
    job_db.get_jobs_for_user.assert_not_called()


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
