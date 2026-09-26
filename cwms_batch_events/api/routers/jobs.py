from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import NoResultFound

from cwms_batch_events.api.dependencies import (
    get_current_user,
    get_job_database,
    get_job_logger,
    get_job_queue,
)
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.execution import UnsupportedConfigVersion
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_logger.base import JobLogger
from cwms_batch_events.core.job_logger.cloudwatch import CloudWatchJobLogger
from cwms_batch_events.core.models import (
    JobLogs,
    JobLogPage,
    JobRecord,
    JobSource,
    ScriptRunOptions,
    ScriptRunRequest,
)
from cwms_batch_events.core.queue import JobQueue

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_office_job(job_id: UUID, user: User, job_db: JobDatabase) -> JobRecord:
    job = job_db.get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.office not in user.offices:
        # Share only the office needed to request access, never job metadata.
        raise HTTPException(status_code=403, detail={"code": "office_access_required", "office": job.office})
    return job


@router.get(
    "",
    responses={200: {"headers": {
        "X-Total-Count": {
            "description": "Total jobs in the user's CWMS offices when pagination is requested.",
            "schema": {"type": "integer"},
        }
    }}},
)
def get_jobs_for_user(
    response: Response,
    limit: int | None = Query(
        default=None, ge=1, le=100,
        description="Maximum jobs to return. Omit to return all jobs.",
    ),
    offset: int = Query(
        default=0, ge=0, description="Number of jobs to skip, newest first.",
    ),
    script_id: UUID | None = Query(default=None, alias="scriptId"),
    submitted_from: datetime | None = Query(default=None, alias="submittedFrom"),
    submitted_before: datetime | None = Query(default=None, alias="submittedBefore"),
    latest_per_script: bool = Query(default=False, alias="latestPerScript"),
    office: list[str] | None = Query(default=None, description="Offices to include. Defaults to all accessible offices."),
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[JobRecord]:
    for boundary in (submitted_from, submitted_before):
        if boundary is not None and boundary.utcoffset() is None:
            raise HTTPException(422, "Date filters must include a timezone")
    if submitted_from and submitted_before and submitted_from >= submitted_before:
        raise HTTPException(422, "The start date must precede the end date")
    dates = {}
    if submitted_from is not None:
        dates["submitted_from"] = submitted_from
    if submitted_before is not None:
        dates["submitted_before"] = submitted_before
    offices = user.offices
    if office:
        offices = sorted(set(value.upper() for value in office))
        if not set(offices).issubset(user.offices):
            raise HTTPException(403, "Office access required")
    if latest_per_script:
        if script_id is not None or limit is not None or offset or dates:
            raise HTTPException(422, "latestPerScript cannot be combined with pagination or scriptId")
        return job_db.get_latest_jobs_for_offices(offices)
    if script_id is not None:
        response.headers["X-Total-Count"] = str(job_db.count_jobs_for_offices(offices, script_id=script_id, **dates))
        return job_db.get_jobs_for_offices(offices, limit=limit or 10, offset=offset, script_id=script_id, **dates)
    if limit is not None or offset:
        response.headers["X-Total-Count"] = str(job_db.count_jobs_for_offices(offices, **dates))
        return job_db.get_jobs_for_offices(offices, limit=limit, offset=offset, **dates)
    job_list = job_db.get_jobs_for_offices(offices, **dates)
    return job_list


@router.post("")
def post_job(
    payload: ScriptRunRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
    queue: JobQueue = Depends(get_job_queue),
) -> JobRecord:
    try:
        job = job_db.create_job(payload, user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script {payload.script_id} not found",
        )
    except UnsupportedConfigVersion as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    except ValueError as exc:
        custom_run = any(value is not None for value in (
            payload.upgrade_to_version, payload.command_mode, payload.shell_command, payload.command_args,
        ))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=("Invalid run settings. Bash commands require version 3 and cannot include separate arguments. Review the command or ask a script administrator to check the saved settings."
                    if custom_run else "The saved script has invalid execution settings. Correct its path and arguments in Scripts Manager before running it."),
        ) from exc

    options = ScriptRunOptions(
        config_version=job.config_version,
        office=job.office.lower(),
        repo_path=job.repo_path,
        script_slug=job.script_slug,
        execution_type=job.execution_type,
        runtime=job.runtime,
        command_args=job.command_args,
        command_mode=job.command_mode,
        shell_command=job.shell_command,
        release_jar=job.release_jar,
        schedule_timezone=job.schedule_timezone or "UTC",
    )
    message = queue.create_job_message(job.id, user.username, JobSource.API, options)
    background_tasks.add_task(queue.send_job_message, message)

    return job


@router.get("/{job_id}")
def get_job_by_id(
    job_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
    job_logger: JobLogger = Depends(get_job_logger),
) -> JobRecord:
    job = get_office_job(job_id, user, job_db)
    if isinstance(job_logger, CloudWatchJobLogger):
        return job_logger.refresh_job(job_id)
    return job


@router.get("/{job_id}/logs")
def get_logs_for_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
    job_logger: JobLogger = Depends(get_job_logger),
) -> JobLogs:
    get_office_job(job_id, user, job_db)
    try:
        logs = job_logger.get_logs_for_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Logs are not available for job '{job_id}': {exc}",
        ) from exc
    return JobLogs(logs=logs)


@router.get("/{job_id}/logs/page")
def get_log_page(
    job_id: UUID,
    cursor: str | None = Query(default=None, max_length=16384),
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
    job_logger: JobLogger = Depends(get_job_logger),
) -> JobLogPage:
    """Read a bounded log page. Pass nextCursor to retrieve subsequent output."""
    get_office_job(job_id, user, job_db)
    try:
        return job_logger.get_log_page(job_id, cursor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid log cursor. Refresh the logs.") from exc
