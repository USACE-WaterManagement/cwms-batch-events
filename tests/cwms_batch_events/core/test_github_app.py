import io
import json
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from cwms_batch_events.core import github_app
from cwms_batch_events.core.settings import get_settings

settings = get_settings()


@pytest.fixture(autouse=True)
def credentials(monkeypatch):
    monkeypatch.setattr(settings, "github_app_secret_id", "batch/github-app")
    github_app._tokens.clear()
    yield
    github_app._tokens.clear()


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
