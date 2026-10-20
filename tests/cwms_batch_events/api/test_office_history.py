import pytest

from cwms_batch_events.core.models import JobLogPage
from tests.factories import make_job_record


@pytest.mark.parametrize("suffix", ["", "/logs", "/logs/page"])
def test_colleague_can_read_office_run_without_management_role(client, user, job_db, job_logger, suffix):
    user.admin_offices = []
    job = make_job_record(username="colleague", office="SWT")
    job_db.get_job_by_id.return_value = job
    job_logger.get_logs_for_job.return_value = "office output"
    job_logger.get_log_page.return_value = JobLogPage(logs="office output")
    assert client.get(f"/jobs/{job.id}{suffix}").status_code == 200


@pytest.mark.parametrize("suffix", ["", "/logs", "/logs/page"])
@pytest.mark.parametrize("missing", [False, True])
def test_denial_exposes_only_office_for_access_request(client, user, job_db, job_logger, suffix, missing):
    # Even the submitter must still have office membership.
    job = make_job_record(username=user.username, office="SPK")
    job_db.get_job_by_id.return_value = None if missing else job
    response = client.get(f"/jobs/{job.id}{suffix}")
    if missing:
        assert response.status_code == 404
        assert response.json() == {"detail": "Job not found"}
    else:
        assert response.status_code == 403
        assert response.json() == {"detail": {"code": "office_access_required", "office": "SPK"}}
    job_logger.get_logs_for_job.assert_not_called()
    job_logger.get_log_page.assert_not_called()
    job_logger.refresh_job.assert_not_called()


@pytest.mark.parametrize("endpoint", ["list", "detail", "submit"])
def test_shared_responses_use_display_name_without_edipi(client, job_db, endpoint):
    job = make_job_record(username="1234567890@mil", display_name="Jane Doe", run_trigger="scheduled")
    job_db.get_job_by_id.return_value = job
    job_db.get_jobs_for_offices.return_value = [job]
    job_db.create_job.return_value = job
    if endpoint == "submit":
        response = client.post("/jobs", json={"scriptId": str(job.script_id)})
    else:
        response = client.get("/jobs" if endpoint == "list" else f"/jobs/{job.id}")
    assert response.status_code == 200
    assert "1234567890" not in response.text
    record = response.json()[0] if endpoint == "list" else response.json()
    assert record["displayName"] == "Jane Doe"
    assert record["runTrigger"] == "scheduled"


@pytest.mark.parametrize("trigger", ["manual", "scheduled", "unknown"])
def test_trigger_is_passed_to_persistence(client, job_db, trigger):
    job = make_job_record(run_trigger=trigger)
    job_db.create_job.return_value = job
    response = client.post("/jobs", json={"scriptId": str(job.script_id), "runTrigger": trigger})
    assert response.status_code == 200
    assert job_db.create_job.call_args.args[0].run_trigger == trigger


def test_unknown_trigger_is_rejected(client, job_db):
    job = make_job_record()
    assert client.post("/jobs", json={"scriptId": str(job.script_id), "runTrigger": "guess"}).status_code == 422
    job_db.create_job.assert_not_called()
