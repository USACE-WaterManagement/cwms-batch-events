from unittest.mock import Mock, patch
from uuid import uuid4

from cwms_batch_events.core.models import ReleaseJar
from cwms_batch_events.core.release_jars import download_ticket
from tests.factories import make_job_record, make_script_create_payload


def jar():
    return ReleaseJar(repository='USACE-WaterManagement/swt-wm-cwbi-jobs', release_id=1, asset_id=2,
                      tag='v1', name='report.jar', sha256='a' * 64, size=5)


def response(data):
    value = Mock()
    value.__enter__ = Mock(return_value=value)
    value.__exit__ = Mock(return_value=False)
    value.json.return_value = data
    return value


def test_release_browsing_checks_admin_before_github(client):
    with patch('cwms_batch_events.api.routers.release_jars.github') as github:
        assert client.get('/repository-releases?office=SPK').status_code == 401
        github.assert_not_called()


def test_only_published_releases_are_listed(client):
    data = [dict(id=1, tag_name='v1', draft=False, name='Report', prerelease=False), dict(id=2, draft=True)]
    with patch('cwms_batch_events.api.routers.release_jars.github', return_value=response(data)):
        result = client.get('/repository-releases?office=SWT').json()
    assert [row['id'] for row in result['releases']] == [1]


def test_jar_assets_require_digest(client):
    release = dict(id=1, tag_name='v1', draft=False)
    assets = [dict(id=2, name='report.jar', size=5, digest='sha256:' + 'a' * 64),
              dict(id=3, name='old.jar', size=5), dict(id=4, name='readme.txt')]
    with patch('cwms_batch_events.api.routers.release_jars.github', side_effect=[response(release), response(assets)]):
        result = client.get('/repository-releases/1/jars?office=SWT').json()
    assert len(result['assets']) == 2
    assert result['assets'][0]['selection']['assetId'] == 2
    assert result['assets'][1]['selection'] is None


def test_save_rejects_unverified_asset(client, job_db):
    payload = make_script_create_payload(configVersion=4, runtime='java', releaseJar=jar().model_dump())
    with patch('cwms_batch_events.api.routers.scripts.validate_selection', side_effect=ValueError('secret')):
        result = client.post('/scripts', json=payload)
    assert result.status_code == 422
    assert 'secret' not in result.text
    job_db.store_script.assert_not_called()


def test_download_ticket_cannot_access_another_job(client, job_db):
    job_id = uuid4()
    ticket = download_ticket(uuid4(), 'test')
    assert client.get(f'/release-jars/jobs/{job_id}', headers={'X-Artifact-Ticket': ticket}).status_code == 403
    job_db.get_job_by_id.assert_not_called()


def test_download_uses_snapshot_not_user_supplied_url(client, job_db):
    job = make_job_record(release_jar=jar())
    job_db.get_job_by_id.return_value = job
    stream = Mock()
    stream.iter_content.return_value = [b'hello']
    with patch('cwms_batch_events.api.routers.release_jars.github', return_value=stream) as github:
        result = client.get(f'/release-jars/jobs/{job.id}', headers={'X-Artifact-Ticket': download_ticket(job.id, 'test')})
    assert result.status_code == 200 and result.content == b'hello'
    github.assert_called_once_with('USACE-WaterManagement/swt-wm-cwbi-jobs/releases/assets/2', binary=True)
    stream.close.assert_called_once()
