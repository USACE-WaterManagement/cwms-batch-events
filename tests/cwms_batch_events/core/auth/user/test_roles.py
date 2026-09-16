from types import SimpleNamespace
from unittest import mock

import pytest
import requests

from cwms_batch_events.core.auth.user.roles import (
    CDA_REQUEST_TIMEOUT_SECONDS,
    CdaUserProfileError,
    get_user_admin_offices,
    get_user_allowed_offices,
    get_user_profile_apikey,
    get_user_profile_jwt,
)


def test_get_user_profile_apikey_calls_cda_with_apikey_header():
    response = mock.Mock()
    response.status_code = 200
    response.ok = True
    response.json.return_value = {
        "user-name": "tester",
        "cac-auth": False,
        "roles": {"SWT": ["CWMS Users"]},
    }

    with mock.patch(
        "cwms_batch_events.core.auth.user.roles.requests.get",
        return_value=response,
    ) as requests_get, mock.patch(
        "cwms_batch_events.core.auth.user.roles.CDA_API_ROOT",
        "http://example/",
    ):
        profile = get_user_profile_apikey("secret")

    assert profile.user_name == "tester"
    requests_get.assert_called_once_with(
        "http://example/user/profile",
        headers={"accept": "application/json", "Authorization": "apikey secret"},
        timeout=CDA_REQUEST_TIMEOUT_SECONDS,
    )


def test_get_user_profile_jwt_calls_cda_with_bearer_header():
    response = mock.Mock()
    response.status_code = 200
    response.ok = True
    response.json.return_value = {
        "user-name": "tester",
        "cac-auth": False,
        "roles": {"SWT": ["CWMS Users"]},
    }

    with mock.patch(
        "cwms_batch_events.core.auth.user.roles.requests.get",
        return_value=response,
    ) as requests_get, mock.patch(
        "cwms_batch_events.core.auth.user.roles.CDA_API_ROOT",
        "http://example/",
    ):
        profile = get_user_profile_jwt("token")

    assert profile.user_name == "tester"
    requests_get.assert_called_once_with(
        "http://example/user/profile",
        headers={"accept": "application/json", "Authorization": "Bearer token"},
        timeout=CDA_REQUEST_TIMEOUT_SECONDS,
    )


@pytest.mark.parametrize("status_code", [401, 403])
def test_get_user_profile_preserves_cda_auth_error(status_code):
    response = mock.Mock(
        status_code=status_code,
        ok=False,
    )
    response.json.return_value = {"detail": "Invalid token: Invalid issuer"}

    with mock.patch(
        "cwms_batch_events.core.auth.user.roles.requests.get",
        return_value=response,
    ), mock.patch(
        "cwms_batch_events.core.auth.user.roles.CDA_API_ROOT",
        "http://example/",
    ):
        with pytest.raises(CdaUserProfileError) as exc_info:
            get_user_profile_jwt("token")

    assert exc_info.value.status_code == status_code
    assert "Invalid token: Invalid issuer" in exc_info.value.detail


def test_get_user_profile_converts_cda_server_error_to_bad_gateway():
    response = mock.Mock(status_code=500, ok=False)

    with mock.patch(
        "cwms_batch_events.core.auth.user.roles.requests.get",
        return_value=response,
    ), mock.patch(
        "cwms_batch_events.core.auth.user.roles.CDA_API_ROOT",
        "http://example/",
    ):
        with pytest.raises(CdaUserProfileError) as exc_info:
            get_user_profile_jwt("token")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "CDA user profile service returned status 500"


def test_get_user_profile_converts_timeout_to_service_unavailable():
    with mock.patch(
        "cwms_batch_events.core.auth.user.roles.requests.get",
        side_effect=requests.Timeout,
    ), mock.patch(
        "cwms_batch_events.core.auth.user.roles.CDA_API_ROOT",
        "http://example/",
    ):
        with pytest.raises(CdaUserProfileError) as exc_info:
            get_user_profile_jwt("token")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "CDA user profile service timed out"


def test_get_user_profile_converts_invalid_profile_to_bad_gateway():
    response = mock.Mock(status_code=200, ok=True)
    response.json.return_value = {"detail": "not a profile"}

    with mock.patch(
        "cwms_batch_events.core.auth.user.roles.requests.get",
        return_value=response,
    ), mock.patch(
        "cwms_batch_events.core.auth.user.roles.CDA_API_ROOT",
        "http://example/",
    ):
        with pytest.raises(CdaUserProfileError) as exc_info:
            get_user_profile_jwt("token")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "CDA user profile service returned an invalid profile"


def test_get_user_profile_requires_cda_api_root():
    with mock.patch("cwms_batch_events.core.auth.user.roles.CDA_API_ROOT", ""):
        with pytest.raises(ValueError, match="No CDA_API_ROOT"):
            get_user_profile_apikey("secret")


def test_get_user_profile_jwt_requires_cda_api_root():
    with mock.patch("cwms_batch_events.core.auth.user.roles.CDA_API_ROOT", ""):
        with pytest.raises(ValueError, match="No CDA_API_ROOT"):
            get_user_profile_jwt("token")


def test_get_user_allowed_offices_filters_to_cwms_users():
    cda_user = SimpleNamespace(
        roles={
            "SWT": ["CWMS Users", "Viewer Users"],
            "LRH": ["Viewer Users"],
            "MVK": ["CWMS Users"],
        }
    )

    assert get_user_allowed_offices(cda_user) == ["SWT", "MVK"]


def test_get_user_admin_offices_filters_to_admin_roles():
    cda_user = SimpleNamespace(
        roles={
            "SWT": ["Data Exchange Mgr"],
            "LRH": ["Viewer Users"],
            "MVK": ["Data Acquisition Mgr", "CWMS Users"],
        }
    )

    assert get_user_admin_offices(cda_user) == ["SWT", "MVK"]
