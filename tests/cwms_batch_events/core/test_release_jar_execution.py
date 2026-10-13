import hashlib
import io
import sys
import time
import ssl
import urllib.error
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from cwms_batch_events.core.models import ExecutionOptions, ReleaseJar
from cwms_batch_events.core.release_jars import BOOTSTRAP, download_ticket, valid_ticket, jar_command


def asset():
    return ReleaseJar(repository='org/office', release_id=1, asset_id=2, tag='v1', name='report.jar',
                      sha256=hashlib.sha256(b'jar-data').hexdigest(), size=8)


def test_ticket_scoped_to_job_and_expires():
    ticket = download_ticket('one', 'key')
    assert valid_ticket('one', ticket, 'key')
    assert not valid_ticket('two', ticket, 'key')
    assert not valid_ticket('one', ticket, 'other-key')
    assert not valid_ticket('one', download_ticket('one', 'key', int(time.time())-1), 'key')


@pytest.mark.parametrize('changes', [dict(config_version=3), dict(runtime='python'), dict(execution_type='command'), dict(command_mode='shell', shell_command='echo no')])
def test_invalid_jar_execution_modes_rejected(changes):
    with pytest.raises(ValueError):
        ExecutionOptions(**(dict(config_version=4, runtime='java', repo_path='ignored', release_jar=asset()) | changes))


def test_bootstrap_verifies_download_and_preserves_arguments(tmp_path):
    selection = asset()
    payload = ExecutionOptions(runtime='java', repo_path='ignored', release_jar=selection, command_args=['two words', '$literal', ''])
    message = SimpleNamespace(job_id='one', payload=payload)
    command = jar_command(message, 'http://events/api', 'private-key')
    assert 'private-key' not in str(command)
    with patch.object(sys, 'argv', ['-c', *command[3:]]), patch('urllib.request.urlopen', return_value=io.BytesIO(b'jar-data')) as download, patch('tempfile.mkdtemp', return_value=str(tmp_path)), patch('os.execvp') as execute:
        exec(BOOTSTRAP, {})
    execute.assert_called_once_with('java', ['java', '-jar', str(tmp_path / 'job.jar'), 'two words', '$literal', ''])
    assert download.call_args.args[0].get_header('X-artifact-ticket')


def test_checksum_failure_never_starts_java(tmp_path):
    selection = asset()
    command = jar_command(SimpleNamespace(job_id='one', payload=SimpleNamespace(release_jar=selection, command_args=[])), 'http://api', 'key')
    with patch.object(sys, 'argv', ['-c', *command[3:]]), patch('urllib.request.urlopen', return_value=io.BytesIO(b'bad-data')), patch('tempfile.mkdtemp', return_value=str(tmp_path)), patch('os.execvp') as execute, pytest.raises(SystemExit):
        exec(BOOTSTRAP, {})
    execute.assert_not_called()


@pytest.mark.parametrize(('error', 'message'), [
    (TimeoutError('private-detail'), 'Timed out contacting the artifact API'),
    (urllib.error.URLError(TimeoutError('private-detail')), 'Timed out contacting the artifact API'),
    (urllib.error.URLError('private-detail'), 'Check DNS, routing'),
    (urllib.error.URLError(ssl.SSLError('private-detail')), 'TLS validation failed'),
    (urllib.error.HTTPError('http://private-host', 403, 'private-detail', {}, None), 'HTTP 403'),
    (OSError('private-detail'), 'Check runner storage'),
    (RuntimeError('private-detail'), 'Unexpected download failure'),
])
def test_download_failure_reports_safe_diagnostic(tmp_path, capsys, error, message):
    command = jar_command(SimpleNamespace(job_id='one', payload=SimpleNamespace(release_jar=asset(), command_args=[])), 'http://private-host', 'private-key')
    with patch.object(sys, 'argv', ['-c', *command[3:]]), patch('urllib.request.urlopen', side_effect=error), patch('tempfile.mkdtemp', return_value=str(tmp_path)), patch('os.execvp') as execute, pytest.raises(SystemExit) as stopped:
        exec(BOOTSTRAP, {})
    assert stopped.value.code == 1
    execute.assert_not_called()
    output = capsys.readouterr().err
    assert message in output
    assert 'Java was not started' in output
    for sensitive in ['private-detail', 'private-host', 'private-key', command[4]]:
        assert sensitive not in output


def test_github_redirect_does_not_forward_credentials():
    from cwms_batch_events.core.release_jars import github
    redirect = Mock(status_code=302, headers={'Location': 'https://release-assets.githubusercontent.com/asset'})
    content = Mock(status_code=200)
    with patch('cwms_batch_events.core.github_app.installation_token', return_value='secret'), patch('requests.get', side_effect=[redirect, content]) as get:
        assert github('org/repo/releases/assets/1', binary=True) is content
        assert 'headers' not in get.call_args_list[1].kwargs


def test_github_redirect_rejects_untrusted_host():
    from cwms_batch_events.core.release_jars import github
    redirect = Mock(status_code=302, headers={'Location': 'https://untrusted.example/asset'})
    with patch('cwms_batch_events.core.github_app.installation_token', return_value='secret'), patch('requests.get', return_value=redirect) as get, pytest.raises(ValueError):
        github('org/repo/releases/assets/1', binary=True)
    assert get.call_count == 1
