from types import SimpleNamespace
from unittest import mock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from cwms_batch_events.core.auth.user.dependencies import (
    get_auth_credentials,
    get_current_user_cwms,
    get_current_user_mock,
    user_cache,
)
from cwms_batch_events.core.auth.user.roles import CdaUserProfileError


class DummyRequest:
    def __init__(self, authorization: str | None):
        self.headers = {}
        if authorization is not None:
            self.headers["Authorization"] = authorization


@pytest.fixture(autouse=True)
def clear_user_cache():
    user_cache.clear()
    yield
    user_cache.clear()


@pytest.mark.anyio
async def test_get_auth_credentials_requires_authorization_header():
    with pytest.raises(HTTPException) as exc_info:
        await get_auth_credentials(DummyRequest(None), "docs")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing Authorization header"


@pytest.mark.anyio
async def test_get_auth_credentials_requires_two_part_header():
    with pytest.raises(HTTPException) as exc_info:
        await get_auth_credentials(DummyRequest("Bearer"), "docs")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid Authorization header"


@pytest.mark.anyio
async def test_get_auth_credentials_parses_scheme_and_credentials():
    credentials = await get_auth_credentials(DummyRequest("Bearer token"), "docs")

    assert credentials.scheme == "Bearer"
    assert credentials.credentials == "token"


@pytest.mark.anyio
async def test_get_current_user_cwms_builds_user_from_bearer_token():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")
    cda_user = SimpleNamespace(
        user_name="tester",
        roles={"SWT": ["CWMS Users", "Data Exchange Mgr"]},
    )

    with mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.verify_jwt",
        return_value={"azp": "cwms"},
    ) as verify_jwt_mock, mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_profile_jwt",
        return_value=cda_user,
    ), mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_allowed_offices",
        return_value=["SWT"],
    ), mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_admin_offices",
        return_value=["SWT"],
    ):
        user = await get_current_user_cwms(credentials)

    assert user.username == "tester"
    assert user.offices == ["SWT"]
    assert user.admin_offices == ["SWT"]
    verify_jwt_mock.assert_called_once_with("token")


@pytest.mark.anyio
async def test_get_current_user_cwms_rejects_unsupported_scheme():
    credentials = HTTPAuthorizationCredentials(scheme="Basic", credentials="secret")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_cwms(credentials)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Unsupported auth scheme: Basic"


@pytest.mark.anyio
async def test_get_current_user_cwms_rejects_invalid_bearer_token():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    with mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.verify_jwt",
        side_effect=Exception("bad token"),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_cwms(credentials)

    assert exc_info.value.status_code == 401
    assert "Invalid token: bad token" in exc_info.value.detail


@pytest.mark.anyio
async def test_get_current_user_cwms_rejects_wrong_azp():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    with mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.verify_jwt",
        return_value={"azp": "not-cwms"},
    ):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_cwms(credentials)

    assert exc_info.value.status_code == 401
    assert "not authorized" in exc_info.value.detail


@pytest.mark.anyio
async def test_get_current_user_cwms_preserves_cda_profile_error():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    with mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.verify_jwt",
        return_value={"azp": "cwms"},
    ), mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_profile_jwt",
        side_effect=CdaUserProfileError(
            401, "CDA rejected the supplied credentials: Invalid issuer"
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_cwms(credentials)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail.endswith("Invalid issuer")


@pytest.mark.anyio
async def test_get_current_user_cwms_builds_user_from_apikey():
    credentials = HTTPAuthorizationCredentials(scheme="apikey", credentials="secret")
    cda_user = SimpleNamespace(
        user_name="tester",
        roles={"SWT": ["CWMS Users"]},
    )

    with mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_profile_apikey",
        return_value=cda_user,
    ) as get_profile, mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_allowed_offices",
        return_value=["SWT"],
    ), mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_admin_offices",
        return_value=[],
    ):
        user = await get_current_user_cwms(credentials)

    assert user.username == "tester"
    assert user.offices == ["SWT"]
    assert user.admin_offices == []
    get_profile.assert_called_once_with("secret")


@pytest.mark.anyio
async def test_get_current_user_cwms_uses_cache():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")
    cda_user = SimpleNamespace(user_name="tester", roles={"SWT": ["CWMS Users"]})

    with mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.verify_jwt",
        return_value={"azp": "cwms"},
    ) as verify_jwt_mock, mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_profile_jwt",
        return_value=cda_user,
    ) as get_profile, mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_allowed_offices",
        return_value=["SWT"],
    ), mock.patch(
        "cwms_batch_events.core.auth.user.dependencies.get_user_admin_offices",
        return_value=[],
    ):
        first = await get_current_user_cwms(credentials)
        second = await get_current_user_cwms(credentials)

    assert first == second
    verify_jwt_mock.assert_called_once_with("token")
    get_profile.assert_called_once_with("token")


@pytest.mark.anyio
async def test_get_current_user_mock_returns_full_access_user():
    user = await get_current_user_mock()

    assert user.username == "dev-user"
    assert "SWT" in user.offices
    assert "SWT" in user.admin_offices
    assert "SWT" in user.roles
