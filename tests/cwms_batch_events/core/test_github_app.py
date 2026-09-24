import io
import json
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from pydantic import SecretStr

from cwms_batch_events.core import github_app
from cwms_batch_events.core.settings import Settings, settings


@pytest.fixture(autouse=True)
def credentials(monkeypatch):
    monkeypatch.setattr(settings, "github_app_secret_id", "batch/github-app")
    monkeypatch.setattr(settings, "github_app_id", "")
    monkeypatch.setattr(settings, "github_installation_id", "")
    monkeypatch.setattr(settings, "github_app_private_key", SecretStr(""))
    github_app._tokens.clear()
    yield
    github_app._tokens.clear()


def test_environment_credentials_are_loaded_and_private_key_is_redacted(monkeypatch):
    monkeypatch.setenv("GITHUB_APP_ID", "123")
    monkeypatch.setenv("GITHUB_INSTALLATION_ID", "456")
    monkeypatch.setenv("GITHUB_APP_PRIVATE_KEY", "private-test-key")
    config = Settings()
    assert config.github_app_id == "123"
    assert config.github_installation_id == "456"
    assert config.github_app_private_key.get_secret_value() == "private-test-key"
    assert "private-test-key" not in repr(config)


def test_environment_credentials_take_precedence_cache_and_refresh(monkeypatch):
    monkeypatch.setattr(settings, "github_app_id", "123")
    monkeypatch.setattr(settings, "github_installation_id", "456")
    monkeypatch.setattr(settings, "github_app_private_key", SecretStr("private-test-key"))
    def response(*args, **kwargs):
        return io.BytesIO(json.dumps({"token": "installation-test-token", "expires_at": datetime.fromtimestamp(time.time() + 3600, timezone.utc).isoformat()}).encode())
    with patch.object(github_app.boto3, "client") as aws, patch.object(github_app.jwt, "encode", return_value="app-jwt") as sign, patch.object(github_app, "urlopen", side_effect=response) as request:
        assert github_app.installation_token() == "installation-test-token"
        assert github_app.installation_token() == "installation-test-token"
        assert request.call_count == 1
        assert sign.call_args.args[0]["iss"] == "123"
        assert sign.call_args.args[1] == "private-test-key"
        assert request.call_args.args[0].full_url.endswith("/app/installations/456/access_tokens")
        assert json.loads(request.call_args.args[0].data) == {"permissions": {"contents": "read"}}
        github_app._tokens["environment:123:456"] = ("old", time.time() + 10)
        assert github_app.installation_token() == "installation-test-token"
        assert request.call_count == 2
        aws.assert_not_called()


@pytest.mark.parametrize("missing", ["github_app_id", "github_installation_id", "github_app_private_key"])
def test_partial_environment_does_not_fall_back_to_secret(monkeypatch, missing):
    monkeypatch.setattr(settings, "github_app_id", "123")
    monkeypatch.setattr(settings, "github_installation_id", "456")
    monkeypatch.setattr(settings, "github_app_private_key", SecretStr("private-test-key"))
    empty = ""
    if missing == "github_app_private_key":
        empty = SecretStr("")
    monkeypatch.setattr(settings, missing, empty)
    with patch.object(github_app.boto3, "client") as aws, patch.object(github_app, "urlopen") as request:
        with pytest.raises(github_app.RepositoryUnavailable) as error:
            github_app.installation_token()
        assert error.value.code == "github_app_not_configured"
        assert "private-test-key" not in str(error.value)
        aws.assert_not_called()
        request.assert_not_called()


def test_invalid_environment_key_is_sanitized(monkeypatch):
    monkeypatch.setattr(settings, "github_app_id", "123")
    monkeypatch.setattr(settings, "github_installation_id", "456")
    monkeypatch.setattr(settings, "github_app_private_key", SecretStr("private-test-key"))
    with patch.object(github_app.jwt, "encode", side_effect=ValueError("private-test-key")):
        with pytest.raises(github_app.RepositoryUnavailable) as error:
            github_app.installation_token()
    assert error.value.code == "github_app_secret_unavailable"
    assert "private-test-key" not in str(error.value)


def test_app_token_is_read_only_cached_and_refreshed():
    secrets = MagicMock()
    secrets.get_secret_value.return_value = {"SecretString": json.dumps({
        "app_id": "123", "installation_id": "456", "private_key": "private-test-key",
    })}
    def response(*args, **kwargs):
        return io.BytesIO(json.dumps({"token": "installation-test-token", "expires_at": datetime.fromtimestamp(time.time() + 3600, timezone.utc).isoformat()}).encode())
    with patch.object(github_app.boto3, "client", return_value=secrets), patch.object(github_app.jwt, "encode", return_value="app-jwt") as sign, patch.object(github_app, "urlopen", side_effect=response) as request:
        assert github_app.installation_token() == "installation-test-token"
        assert github_app.installation_token() == "installation-test-token"
        assert request.call_count == 1
        assert sign.call_args.kwargs["algorithm"] == "RS256"
        sent = request.call_args.args[0]
        assert sent.full_url.endswith("/app/installations/456/access_tokens")
        assert json.loads(sent.data) == {"permissions": {"contents": "read"}}
        github_app._tokens[settings.github_app_secret_id] = ("old", time.time() + 10)
        assert github_app.installation_token() == "installation-test-token"
        assert request.call_count == 2


def test_secret_failure_is_sanitized():
    with patch.object(github_app.boto3, "client", side_effect=ValueError("private-test-key")):
        with pytest.raises(github_app.RepositoryUnavailable) as error:
            github_app.installation_token()
    assert error.value.code == "github_app_secret_unavailable"
    assert "private-test-key" not in str(error.value)


def test_rejected_installation_is_sanitized():
    secrets = MagicMock()
    secrets.get_secret_value.return_value = {"SecretString": json.dumps({
        "app_id": "123", "installation_id": "456", "private_key": "private-test-key",
    })}
    with patch.object(github_app.boto3, "client", return_value=secrets), patch.object(github_app.jwt, "encode", return_value="private-jwt"), patch.object(github_app, "urlopen", side_effect=ValueError("private-jwt")):
        with pytest.raises(github_app.RepositoryUnavailable) as error:
            github_app.installation_token()
    assert error.value.code == "github_app_authentication_failed"
    assert "private-jwt" not in str(error.value)
