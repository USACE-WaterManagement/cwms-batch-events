from cwms_batch_events.core.models import JobLogPage
from tests.factories import make_job_record


def test_search_snippets_and_office_scope(client, job_db, job_logger, user):
    job = make_job_record(office=user.offices[0])
    job_db.get_jobs_for_offices.side_effect = [[job], []]
    job_logger.get_log_page.return_value = JobLogPage(logs='Starting\nFAILED to download report\nFinished')
    response = client.get('/job-log-search?q=failed')
    assert response.status_code == 200
    result = response.json()
    assert result['results'][0]['jobId'] == str(job.id)
    assert 'FAILED' in result['results'][0]['snippets'][0]
    assert result['nextCursor'] is None
    assert job_db.get_jobs_for_offices.call_args.args[0] == sorted(user.offices)


def test_unauthorized_office_never_reads_output(client, job_db, job_logger):
    assert client.get('/job-log-search?q=failed&office=SECRET').status_code == 403
    job_db.get_jobs_for_offices.assert_not_called()
    job_logger.get_log_page.assert_not_called()


def test_continuation_reads_later_output_and_rejects_tampering(client, job_db, job_logger, user):
    job = make_job_record(office=user.offices[0])
    job_db.get_jobs_for_offices.side_effect = [[job], []]
    job_db.get_job_by_id.return_value = job
    job_logger.get_log_page.side_effect = [
        JobLogPage(logs='nothing', has_more=True, next_cursor=str(i)) for i in range(3)
    ] + [JobLogPage(logs='later FAILED output')]
    first = client.get('/job-log-search?q=failed').json()
    assert first['results'] == [] and first['nextCursor']
    assert job_logger.get_log_page.call_count == 3
    assert client.get('/job-log-search', params={'q': 'failed', 'cursor': first['nextCursor'] + 'x'}).status_code == 400
    assert client.get('/job-log-search', params={'q': 'changed', 'cursor': first['nextCursor']}).status_code == 400
    result = client.get('/job-log-search', params={'q': 'failed', 'cursor': first['nextCursor']}).json()
    assert result['results'][0]['snippets'] == ['later FAILED output']
    assert result['nextCursor'] is None


def test_unavailable_logs_are_reported(client, job_db, job_logger, user):
    job_db.get_jobs_for_offices.side_effect = [[make_job_record(office=user.offices[0])], []]
    job_logger.get_log_page.return_value = JobLogPage(logs='', available=False)
    result = client.get('/job-log-search?q=failed').json()
    assert result['unavailableJobs'] == 1


def test_read_failure_is_not_an_empty_success(client, job_db, job_logger, user):
    job_db.get_jobs_for_offices.return_value = [make_job_record(office=user.offices[0])]
    job_logger.get_log_page.side_effect = RuntimeError('private upstream detail')
    response = client.get('/job-log-search?q=failed')
    assert response.status_code == 503
    assert 'private upstream detail' not in response.text
