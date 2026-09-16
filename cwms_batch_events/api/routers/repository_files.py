"""Optional, read-only catalogs; repository failures never block manual paths."""
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.api.routers.scripts import check_user_office_admin
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.github_app import RepositoryUnavailable, installation_token, mock_enabled
from cwms_batch_events.core.settings import RepositorySettings, get_settings

settings = get_settings()

router = APIRouter(tags=["repositories"])


def warning(error):
    return {"code": error.code, "message": str(error)}


@router.get("/repository-status")
def repository_status(user: User = Depends(get_current_user)):
    repositories = {
        office: (
            settings.office_repositories[office].repository
            if office in settings.office_repositories
            else f"USACE-WaterManagement/{office.lower()}-wm-cwbi-jobs"
        )
        for office in sorted(set(user.offices + user.admin_offices))
    }
    if mock_enabled():
        return {"warnings": [], "mock": True, "repositories": repositories}
    try:
        installation_token()
        return {"warnings": [], "mock": False, "repositories": repositories}
    except RepositoryUnavailable as error:
        return {"warnings": [warning(error)], "mock": False, "repositories": repositories}


@router.get("/repository-files")
def repository_files(office: str, user: User = Depends(get_current_user)):
    office = office.upper()
    check_user_office_admin(user, office)
    if not re.fullmatch(r"[A-Z0-9-]+", office):
        raise HTTPException(422, "Invalid office")
    ref = settings.github_repository_ref or {
        "local": "cwbi-dev", "dev": "cwbi-dev", "test": "cwbi-test", "prod": "cwbi-prod",
    }.get(settings.deployment_environment, settings.deployment_environment)
    config = settings.office_repositories.get(office) or RepositorySettings(
        repository=f"USACE-WaterManagement/{office.lower()}-wm-cwbi-jobs", ref=ref,
    )
    result = {"repository": config.repository, "ref": config.ref, "paths": [], "warnings": [], "mock": mock_enabled()}
    if mock_enabled():
        result["paths"] = ["python/reports/example.py", "bin/example.sh", "java/artifacts.json"]
        return result
    try:
        token = installation_token()
        url = f"https://api.github.com/repos/{config.repository}/git/trees/{quote(config.ref, safe='')}?recursive=1"
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "cwms-batch-events",
                   "Authorization": f"Bearer {token}"}
        with urlopen(Request(url, headers=headers), timeout=10) as response:
            catalog = json.load(response)
        if catalog.get("truncated"):
            raise RepositoryUnavailable("repository_catalog_truncated", "The repository file list is too large to browse. Enter the path manually.")
        result["paths"] = [item["path"] for item in catalog["tree"] if item.get("type") == "blob"]
    except RepositoryUnavailable as error:
        result["warnings"] = [warning(error)]
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError, AttributeError) as error:
        message = "Repository files are unavailable. Check the repository, branch, and GitHub App access. Enter the path manually."
        if isinstance(error, HTTPError) and error.code in (401, 403):
            message = "GitHub denied repository access or its request limit was reached. Ask an administrator to check App access. Enter the path manually."
        result["warnings"] = [{"code": "repository_unavailable", "message": message}]
    return result
