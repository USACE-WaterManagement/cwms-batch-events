import requests
from fastapi import APIRouter, Depends, Request

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.settings import get_settings
from cwms_batch_events.lambdas.dispatch_job.utils import OFFICES


router = APIRouter(prefix="/users", tags=["scripts"])


@router.get("/me/offices")
def get_offices(user: User = Depends(get_current_user)) -> list[str]:
    return user.offices


def _cda_office_divisions(request: Request) -> dict[str, str]:
    authorization = request.headers.get("Authorization")
    cda_api_root = get_settings().cda_api_root
    if not authorization or not cda_api_root:
        return {}

    try:
        response = requests.get(
            f"{cda_api_root.rstrip('/')}/offices",
            headers={"Authorization": authorization},
            timeout=10,
        )
        if not response.ok:
            return {}
        payload = response.json()
    except (requests.RequestException, ValueError):
        return {}

    office_entries = payload.get("offices", []) if isinstance(payload, dict) else payload
    if not isinstance(office_entries, list):
        return {}

    divisions: dict[str, str] = {}
    for office in office_entries:
        if not isinstance(office, dict) or not isinstance(office.get("name"), str):
            continue
        reports_to = office.get("reportsTo") or office.get("reports-to")
        if isinstance(reports_to, str) and reports_to.strip():
            divisions[office["name"].upper()] = reports_to.upper()
    return divisions


@router.get("/me/office-groups")
def get_office_groups(
    request: Request, user: User = Depends(get_current_user)
) -> dict[str, list[str]]:
    cda_divisions = _cda_office_divisions(request)
    groups: dict[str, list[str]] = {}
    for office in user.offices:
        division = cda_divisions.get(office.upper())
        if not division:
            division = OFFICES.get(office.lower(), {}).get("division", "other")
        groups.setdefault(division, []).append(office)

    return {
        division: sorted(offices, key=str.casefold)
        for division, offices in sorted(groups.items())
    }


@router.get("/me/system-admin")
def get_system_admin(user: User = Depends(get_current_user)) -> bool:
    return "Data Acquisition Mgr" in user.roles.get("HQ", [])


@router.get("/me/admin-offices")
def get_admin_offices(
    user: User = Depends(get_current_user),
) -> list[str]:
    return user.admin_offices
