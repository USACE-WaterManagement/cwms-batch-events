from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError, ReadTimeoutError
import requests

from cwms_batch_events.lambdas.dispatch_job.dispatcher import _dispatch_and_bind, lambda_handler
from tests.factories import make_job_message, make_lambda_context

MODULE = 'cwms_batch_events.lambdas.dispatch_job.dispatcher'


def response(**outcome):
    result = Mock(status_code=204)
    result.json.return_value = outcome
    return result


@pytest.mark.parametrize('source', ['user', 'scheduler'])
def test_missing_definition_records_failure_before_ack(source):
    message = make_job_message()
    if source == 'scheduler':
        message.requested_by.source = 'scheduler'
    error = ClientError({'Error': {'Code': 'ClientException', 'Message':
        'JobDefinition name cwms-nwdp-jobs-jobdef does not exist or is not in ACTIVE status. private-command'}}, 'SubmitJob')
    with patch(f'{MODULE}.requests.post', side_effect=[response(claimed=True), response()]) as post, patch(f'{MODULE}.dispatch_job', side_effect=error):
        _dispatch_and_bind(message, {})
    assert post.call_args.args[0].endswith('/dispatch-failure')
    reason = post.call_args.kwargs['json']['reason']
    assert 'no active AWS Batch job definition' in reason
    assert 'private-command' not in reason


def test_failure_callback_outage_retries_without_ack():
    error = ClientError({'Error': {'Code': 'ClientException', 'Message': 'bad input'}}, 'SubmitJob')
    failed = response()
    failed.raise_for_status.side_effect = requests.HTTPError('unavailable')
    with patch(f'{MODULE}.requests.post', side_effect=[response(claimed=True), failed]), patch(f'{MODULE}.dispatch_job', side_effect=error):
        with pytest.raises(requests.HTTPError):
            _dispatch_and_bind(make_job_message(), {})


@pytest.mark.parametrize('error', [
    ClientError({'Error': {'Code': 'ServerException', 'Message': 'unavailable'}}, 'SubmitJob'),
    ClientError({'Error': {'Code': 'AccessDeniedException'}}, 'GetSecretValue'),
    ReadTimeoutError(endpoint_url='https://batch'),
])
def test_uncertain_errors_are_not_recorded_as_proven_failures(error):
    with patch(f'{MODULE}.requests.post', return_value=response(claimed=True)) as post, patch(f'{MODULE}.dispatch_job', side_effect=error):
        with pytest.raises(type(error)):
            _dispatch_and_bind(make_job_message(), {})
    assert post.call_count == 1


@pytest.mark.parametrize('status,external', [('Failed', None), ('Dispatch unknown', None), ('Pending', 'batch-id')])
def test_redelivery_cannot_submit_failed_expired_or_linked_job(status, external):
    with patch(f'{MODULE}.requests.post', return_value=response(claimed=False, status=status, external_job_id=external)), patch(f'{MODULE}.dispatch_job') as dispatch:
        _dispatch_and_bind(make_job_message(), {})
    dispatch.assert_not_called()


def test_claimed_without_outcome_retries_observation_without_resubmission():
    with patch(f'{MODULE}.requests.post', return_value=response(claimed=False, status='Pending', external_job_id=None)), patch(f'{MODULE}.dispatch_job') as dispatch:
        with pytest.raises(RuntimeError, match='awaiting its outcome'):
            _dispatch_and_bind(make_job_message(), {})
    dispatch.assert_not_called()


def test_bad_record_does_not_starve_other_records_in_same_batch():
    message = make_job_message()
    with patch(f'{MODULE}.get_internal_token', return_value='test'), patch(f'{MODULE}._dispatch_and_bind') as dispatch:
        with pytest.raises(ValueError):
            lambda_handler({'Records': [{'body': 'invalid'}, {'body': message.model_dump_json()}]}, make_lambda_context())
    dispatch.assert_called_once()


def test_submit_error_does_not_starve_other_records_in_same_batch():
    message = make_job_message()
    with patch(f'{MODULE}.get_internal_token', return_value='test'), patch(f'{MODULE}._dispatch_and_bind', side_effect=[RuntimeError('unavailable'), None]) as dispatch:
        with pytest.raises(RuntimeError):
            lambda_handler({'Records': [{'body': message.model_dump_json()}] * 2}, make_lambda_context())
    assert dispatch.call_count == 2
