"""Server-side GitHub App credentials; never return tokens or upstream errors to clients."""
import json
import time
from datetime import datetime
from threading import Lock
from urllib.request import Request, urlopen

import boto3
import jwt
from botocore.config import Config

from cwms_batch_events.core.settings import get_settings

settings = get_settings()


class RepositoryUnavailable(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


_lock = Lock()
_tokens: dict[str, tuple[str, float]] = {}


def mock_enabled():
    # A mock must never silently replace real repositories in a deployment.
    return settings.repository_mock_mode and settings.deployment_environment == "local"


def installation_token():
    secret_id = settings.github_app_secret_id
    private_key = settings.github_app_private_key.get_secret_value()
    use_environment = any((settings.github_app_id, settings.github_installation_id, private_key))
    cache_key = secret_id
    if use_environment:
        if not all((settings.github_app_id, settings.github_installation_id, private_key)):
            raise RepositoryUnavailable(
                "github_app_not_configured",
                "Configure all three GitHub App environment variables: GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY. Manual path entry is available.",
            )
        cache_key = f"environment:{settings.github_app_id}:{settings.github_installation_id}"
    elif not secret_id:
        raise RepositoryUnavailable(
            "github_app_not_configured",
            "The GitHub App token is not set. An administrator must configure the Batch API GitHub App secret. You can still enter a script or JAR path manually.",
        )
    with _lock:
        cached = _tokens.get(cache_key)
        if cached and cached[1] > time.time() + 120:
            return cached[0]
        try:
            if use_environment:
                secret = {
                    "app_id": settings.github_app_id,
                    "installation_id": settings.github_installation_id,
                    "private_key": private_key,
                }
            else:
                result = boto3.client("secretsmanager", config=Config(
                    connect_timeout=3, read_timeout=5, retries={"total_max_attempts": 1},
                )).get_secret_value(SecretId=secret_id)
                secret = json.loads(result["SecretString"])
            app_id = str(secret["app_id"])
            installation_id = str(secret["installation_id"])
            if not installation_id.isdecimal() or not app_id:
                raise ValueError("Invalid App identifiers")
            now = int(time.time())
            signed = jwt.encode(
                {"iat": now - 60, "exp": now + 540, "iss": app_id},
                secret["private_key"], algorithm="RS256",
            )
        except Exception as error:
            raise RepositoryUnavailable(
                "github_app_secret_unavailable",
                "The GitHub App credentials could not be read or are invalid. Ask an administrator to check the configured credentials and secret access permissions. Manual path entry is available.",
            ) from error
        try:
            request = Request(
                f"https://api.github.com/app/installations/{installation_id}/access_tokens",
                data=json.dumps({"permissions": {"contents": "read"}}).encode(),
                headers={"Authorization": f"Bearer {signed}", "Accept": "application/vnd.github+json",
                         "Content-Type": "application/json", "User-Agent": "cwms-batch-events"},
                method="POST",
            )
            with urlopen(request, timeout=10) as response:
                payload = json.load(response)
            token = payload["token"]
            expires = datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00")).timestamp()
            if not isinstance(token, str) or not token or expires <= time.time() + 120:
                raise ValueError("Invalid installation token")
            _tokens[cache_key] = (token, expires)
            return token
        except Exception as error:
            raise RepositoryUnavailable(
                "github_app_authentication_failed",
                "GitHub App authentication failed. Ask an administrator to check the App installation and credentials. Manual path entry is available.",
            ) from error
