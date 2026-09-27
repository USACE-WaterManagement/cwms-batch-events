import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from cwms_batch_events.core.settings import (
    ApiSettings, DatabaseSettings, DispatcherSettings, DynamoSettings, Settings, get_settings,
)


@pytest.fixture(autouse=True)
def clean_settings_environment(monkeypatch):
    for name in {*ApiSettings.model_fields, *DispatcherSettings.model_fields}:
        monkeypatch.delenv(name.upper(), raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


DATABASE = dict(pguser="user", pgpassword="password", pgdatabase="events", pghost="db")
API = dict(**DATABASE, app_key="test", auth_environment="TEST", cda_api_root="https://cda/")
DISPATCHER = dict(**DATABASE, queue_url="http://queue/jobs", s3_bucket="logs",
                  s3_endpoint_url="http://s3", cda_api_root="http://cda/")


def test_shared_settings_do_not_require_api_configuration():
    settings = Settings()
    assert settings.app_key is None
    assert settings.auth_host is None
    assert DynamoSettings().dynamodb_host is None
    assert settings.fastapi_root_path == ""
    assert Settings(root_path="/api").fastapi_root_path == "/api"


@pytest.mark.parametrize("name", ["app_key", "auth_environment", "cda_api_root", *DATABASE])
@pytest.mark.parametrize("value", [None, "", "   "])
def test_api_rejects_missing_configuration(name, value):
    with pytest.raises(ValidationError, match=name.upper()):
        ApiSettings(**{**API, name: value})


def test_environment_blank_values_are_missing(monkeypatch):
    for name, value in API.items():
        monkeypatch.setenv(name.upper(), value)
    monkeypatch.setenv("APP_KEY", "   ")
    with pytest.raises(ValidationError, match="APP_KEY"):
        ApiSettings()


def test_mock_api_does_not_require_external_auth_or_github():
    settings = ApiSettings(**DATABASE, app_key="test", mock_user=True)
    assert settings.github_token.get_secret_value() == ""
    assert settings.auth_environment is None


def test_authentication_configuration():
    with pytest.raises(ValidationError, match="AUTH_ENVIRONMENT"):
        ApiSettings(**{**API, "auth_environment": "TYPO"})
    with pytest.raises(ValidationError, match="AUTH_HOST"):
        ApiSettings(**{**API, "auth_environment": "LOCAL"})
    ApiSettings(**{**API, "auth_environment": "LOCAL", "auth_host": "http://auth"})


@pytest.mark.parametrize("name", ["s3_bucket", "s3_endpoint_url", "sqs_endpoint_url"])
def test_local_api_requires_local_services(name):
    values = dict(**API, default_job_runner="docker-local", s3_bucket="logs",
                  s3_endpoint_url="http://s3", sqs_endpoint_url="http://queue")
    del values[name]
    with pytest.raises(ValidationError, match=name.upper()):
        ApiSettings(**values)


def test_database_and_dispatcher_do_not_require_api_secrets():
    assert DatabaseSettings(**DATABASE).pguser == "user"
    assert "auth_environment" not in DispatcherSettings.model_fields


@pytest.mark.parametrize("name", list(DISPATCHER))
def test_dispatcher_requires_only_its_dependencies(name):
    values = dict(DISPATCHER)
    del values[name]
    with pytest.raises(ValidationError, match=name.upper()):
        DispatcherSettings(**values)


def test_dispatcher_starts_without_api_credentials(monkeypatch):
    for name, value in DISPATCHER.items():
        monkeypatch.setenv(name.upper(), value)
    # API-only parsing must not leak into dispatcher startup.
    monkeypatch.setenv("OFFICE_REPOSITORIES", "not json")
    monkeypatch.setenv("DEFAULT_JOB_RUNNER", "not an API runner")
    script = Path(__file__).resolve().parents[3] / "infra/dispatcher/dispatcher_loop.py"
    result = subprocess.run(
        [sys.executable, "-c", """
import runpy
import sys
from unittest.mock import Mock, patch
client = Mock()
client.receive_message.side_effect = StopIteration('polling started')
with patch('boto3.client', return_value=client):
    try:
        runpy.run_path(sys.argv[1])
    except StopIteration:
        pass
client.receive_message.assert_called_once_with(
    QueueUrl='http://queue/jobs', MaxNumberOfMessages=1, WaitTimeSeconds=20)
""", str(script)],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_api_fails_before_creating_dependencies():
    result = subprocess.run(
        [sys.executable, "-c", """
from unittest.mock import patch
from pydantic import ValidationError
with patch('sqlalchemy.create_engine') as engine, patch('boto3.client') as client:
    try:
        import cwms_batch_events.api.main
    except ValidationError as exc:
        assert 'PGUSER' in str(exc)
    else:
        raise AssertionError('API accepted missing configuration')
    engine.assert_not_called()
    client.assert_not_called()
"""], capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_settings_cache_is_component_specific(monkeypatch):
    for name, value in API.items():
        monkeypatch.setenv(name.upper(), value)
    assert get_settings() is get_settings()
    assert isinstance(get_settings(ApiSettings), ApiSettings)
    assert get_settings(ApiSettings) is not get_settings()


def test_password_is_not_trimmed():
    assert DatabaseSettings(**{**DATABASE, "pgpassword": " secret "}).pgpassword == " secret "


@pytest.mark.parametrize("port", [0, 65536])
def test_invalid_port_is_rejected(port):
    with pytest.raises(ValidationError):
        DatabaseSettings(**DATABASE, pgport=port)


def test_invalid_runner_is_rejected():
    with pytest.raises(ValidationError):
        Settings(default_job_runner="typo")
