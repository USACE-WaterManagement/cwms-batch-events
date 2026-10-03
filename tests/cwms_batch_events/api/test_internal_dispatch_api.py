from uuid import uuid4
import pytest
from cwms_batch_events.api.main import app
from cwms_batch_events.core.auth.service.dependencies import require_internal_auth


def test_dispatch_failure_persists_through_internal_api(client, job_db):
    job_id = uuid4()
    response = client.post(f'/internal/jobs/{job_id}/dispatch-failure', json={'reason': 'No active job definition'})
    assert response.status_code == 204
    job_db.fail_dispatch.assert_called_once_with(job_id, 'No active job definition')


def test_dispatch_claim_returns_database_outcome(client, job_db):
    job_id = uuid4()
    job_db.claim_dispatch.return_value = {'claimed': False, 'status': 'Dispatch unknown', 'external_job_id': None}
    response = client.post(f'/internal/jobs/{job_id}/claim-dispatch')
    assert response.status_code == 200
    assert response.json() == job_db.claim_dispatch.return_value


@pytest.mark.parametrize('path,body', [('claim-dispatch', None), ('dispatch-failure', {'reason': 'rejected'})])
def test_dispatch_mutations_require_internal_auth(client, job_db, path, body):
    app.dependency_overrides.pop(require_internal_auth)
    response = client.post(f'/internal/jobs/{uuid4()}/{path}', json=body)
    assert response.status_code == 401
    job_db.claim_dispatch.assert_not_called()
    job_db.fail_dispatch.assert_not_called()


@pytest.mark.parametrize('reason', ['', 'x' * 1001])
def test_failure_reason_is_bounded(client, job_db, reason):
    assert client.post(f'/internal/jobs/{uuid4()}/dispatch-failure', json={'reason': reason}).status_code == 422
    job_db.fail_dispatch.assert_not_called()
