from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import NoResultFound

from cwms_batch_events.api.dependencies import get_current_user, get_job_database
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_database.postgres.postgres import SlugError
from cwms_batch_events.core.models import (
    ScriptCreate,
    ScriptRead,
    ScriptUpdate,
)


def check_user_office_admin(user: User, office: str):
    if office not in user.admin_offices:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User does not have script admin access for office '{office}'",
        )


router = APIRouter(prefix="/scripts", tags=["scripts"])


@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_script(
    script_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        job_db.remove_script_if_allowed(script_id, user.admin_offices)
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script {script_id} not found",
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.get("")
def get_scripts_for_office_endpoint(
    office: str,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
):
    check_user_office_admin(user, office)
    return job_db.get_scripts_for_office(office)


@router.post("")
def post_script(
    payload: ScriptCreate,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
):
    check_user_office_admin(user, payload.office)
    try:
        return job_db.store_script(payload)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        )
    except SlugError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.put("/{script_id}")
def put_script(
    script_id: UUID,
    payload: ScriptUpdate,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        return job_db.update_script(script_id, payload, user.admin_offices)
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script {script_id} not found",
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        )


@router.get("/scheduled")
def get_scheduled_scripts(
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[ScriptRead]:
    # The existing catalog applies active/office/role authorization first.
    return [
        script
        for script in job_db.retrieve_script_catalog(user.roles)
        if script.schedule_enabled and script.schedule_type in {"hourly", "cron"}
    ]


@router.get("/catalog")
def get_user_scripts_catalog(
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[ScriptRead]:
    return job_db.retrieve_script_catalog(user.roles)
