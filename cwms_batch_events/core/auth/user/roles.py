import logging

import requests
from pydantic import ValidationError

from cwms_batch_events.core.models import CdaUserProfile
from cwms_batch_events.core.settings import settings

CDA_API_ROOT = settings.cda_api_root
CDA_REQUEST_TIMEOUT_SECONDS = 10

logger = logging.getLogger(__name__)


class CdaUserProfileError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _get_error_detail(response: requests.Response) -> str | None:
    try:
        payload = response.json()
    except ValueError:
        return None

    if not isinstance(payload, dict):
        return None

    for key in ("detail", "message", "error_description", "error"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:500]
    return None


def _get_user_profile(authorization: str) -> CdaUserProfile:
    if not CDA_API_ROOT:
        raise ValueError("No CDA_API_ROOT has been provided")

    url = f"{CDA_API_ROOT}user/profile"
    headers = {"accept": "application/json", "Authorization": authorization}
    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=CDA_REQUEST_TIMEOUT_SECONDS,
        )
    except requests.Timeout as exc:
        logger.warning("CDA user profile request timed out")
        raise CdaUserProfileError(
            503, "CDA user profile service timed out"
        ) from exc
    except requests.RequestException as exc:
        logger.warning("CDA user profile request failed: %s", type(exc).__name__)
        raise CdaUserProfileError(
            503, "CDA user profile service is unavailable"
        ) from exc

    if response.status_code in (401, 403):
        upstream_detail = _get_error_detail(response)
        detail = "CDA rejected the supplied credentials"
        if upstream_detail:
            detail = f"{detail}: {upstream_detail}"
        logger.warning(
            "CDA user profile request rejected with status %s",
            response.status_code,
        )
        raise CdaUserProfileError(response.status_code, detail)

    if not response.ok:
        logger.warning(
            "CDA user profile request failed with status %s",
            response.status_code,
        )
        raise CdaUserProfileError(
            502,
            f"CDA user profile service returned status {response.status_code}",
        )

    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning("CDA user profile response was not valid JSON")
        raise CdaUserProfileError(
            502, "CDA user profile service returned an invalid response"
        ) from exc

    try:
        return CdaUserProfile(**payload)
    except (TypeError, ValidationError) as exc:
        logger.warning("CDA user profile response did not match the expected schema")
        raise CdaUserProfileError(
            502, "CDA user profile service returned an invalid profile"
        ) from exc


def get_user_profile_apikey(apikey: str):
    return _get_user_profile(f"apikey {apikey}")


def get_user_profile_jwt(token: str):
    return _get_user_profile(f"Bearer {token}")


def get_user_allowed_offices(cda_user: CdaUserProfile):
    allowed_offices: list[str] = []
    for office, roles in cda_user.roles.items():
        if "CWMS Users" in roles:
            allowed_offices.append(office)
    return allowed_offices


def get_user_admin_offices(cda_user: CdaUserProfile):
    admin_roles = ["Data Acquisition Mgr", "Data Exchange Mgr"]
    admin_offices: list[str] = []
    for office, roles in cda_user.roles.items():
        office_admin = [role for role in roles if role in admin_roles]
        if len(office_admin) > 0:
            admin_offices.append(office)
    return admin_offices
