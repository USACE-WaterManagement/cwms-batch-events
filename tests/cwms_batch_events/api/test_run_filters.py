from datetime import datetime, timezone
import pytest
from tests.factories import make_job_record, make_script_create_payload


def test_date_filters_apply_to_count_and_page(client, job_db, user):
    job = make_job_record()
    job_db.get_jobs_for_offices.return_value = [job]
    job_db.count_jobs_for_offices.return_value = 1
    result = client.get('/jobs', params=dict(limit=10, offset=0, submittedFrom='2026-09-01T00:00:00Z', submittedBefore='2026-09-03T00:00:00Z'))
    assert result.status_code == 200
    assert result.headers['X-Total-Count'] == '1'
    dates = dict(submitted_from=datetime(2026, 9, 1, tzinfo=timezone.utc), submitted_before=datetime(2026, 9, 3, tzinfo=timezone.utc))
    job_db.get_jobs_for_offices.assert_called_once_with(user.offices, limit=10, offset=0, **dates)
    job_db.count_jobs_for_offices.assert_called_once_with(user.offices, **dates)


@pytest.mark.parametrize('params', [
    dict(submittedFrom='2026-09-01T00:00:00'),
    dict(submittedFrom='2026-09-03T00:00:00Z', submittedBefore='2026-09-01T00:00:00Z'),
    dict(latestPerScript=True, submittedFrom='2026-09-01T00:00:00Z'),
])
def test_reject_invalid_date_selection(client, job_db, params):
    assert client.get('/jobs', params=params).status_code == 422
    job_db.get_jobs_for_offices.assert_not_called()


@pytest.mark.parametrize('expression', ['* * * * *', '*/2 * * * *', '0,1 8 * * *', '*/7 * * * *', '0,59 * * * *'])
def test_api_rejects_fast_schedule(client, job_db, expression):
    payload = make_script_create_payload(configVersion=4, scheduleEnabled=True, scheduleType='cron', scheduleCron=expression)
    response = client.post('/scripts', json=payload)
    assert response.status_code == 422
    assert '5 minutes' in response.text
    job_db.store_script.assert_not_called()
