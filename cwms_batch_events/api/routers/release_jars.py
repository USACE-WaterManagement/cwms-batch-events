from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from cwms_batch_events.api.dependencies import get_current_user, get_job_database
from cwms_batch_events.api.routers.scripts import check_user_office_admin
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.release_jars import github, office_repository, release_selection, valid_ticket
from cwms_batch_events.core.settings import get_settings

router = APIRouter(tags=["repositories"])


@router.get("/repository-releases")
def releases(office: str, page: int = Query(default=1, ge=1, le=1000), user: User = Depends(get_current_user)):
    office = office.upper()
    check_user_office_admin(user, office)
    config = office_repository(office)
    try:
        with github(f"{config.repository}/releases?per_page=20&page={page}") as response:
            entries = response.json()
        results = []
        for release in entries:
            if release.get("draft"):
                continue
            # Releases can contain more than the embedded asset list. Read the
            # assets endpoint separately when selecting a release below.
            results.append({"id": release["id"], "tag": release["tag_name"],
                "name": release.get("name") or release["tag_name"], "prerelease": release["prerelease"]})
        return {"repository": config.repository, "ref": config.ref, "releases": results, "hasMore": len(entries) == 20}
    except Exception as exc:
        raise HTTPException(503, "Release browsing is unavailable. Check GitHub App access and try again.") from exc


@router.get("/repository-releases/{release_id}/jars")
def jars(release_id: int, office: str, page: int = Query(default=1, ge=1, le=1000), user: User = Depends(get_current_user)):
    office = office.upper()
    check_user_office_admin(user, office)
    config = office_repository(office)
    try:
        with github(f"{config.repository}/releases/{release_id}") as response:
            release = response.json()
        if release.get("draft"):
            raise ValueError("Draft release")
        with github(f"{config.repository}/releases/{release_id}/assets?per_page=100&page={page}") as response:
            assets = response.json()
        rows = []
        for asset in assets:
            if not asset.get("name", "").endswith(".jar"):
                continue
            selection = release_selection(config.repository, release, asset)
            rows.append({"name": asset["name"], "selection": selection.model_dump() if selection else None})
        return {"assets": rows, "hasMore": len(assets) == 100}
    except Exception as exc:
        raise HTTPException(503, "Release JARs are unavailable. Try another release or retry.") from exc


@router.get("/release-jars/jobs/{job_id}")
def download(job_id: UUID, x_artifact_ticket: str = Header(default=""), job_db: JobDatabase = Depends(get_job_database)):
    if not valid_ticket(job_id, x_artifact_ticket, get_settings().app_key):
        raise HTTPException(403, "Invalid or expired artifact ticket")
    job = job_db.get_job_by_id(job_id)
    if not job or not job.release_jar:
        raise HTTPException(404, "Release JAR not found")
    selection = job.release_jar
    try:
        response = github(f"{selection.repository}/releases/assets/{selection.asset_id}", binary=True)
    except Exception as exc:
        raise HTTPException(503, "The saved release JAR is unavailable") from exc
    def chunks():
        size = 0
        try:
            for chunk in response.iter_content(1024 * 1024):
                size += len(chunk)
                if size > selection.size:
                    raise ValueError("Release asset exceeds its saved size")
                yield chunk
        finally:
            response.close()
    return StreamingResponse(chunks(), media_type="application/java-archive", headers={"Cache-Control": "no-store"})
