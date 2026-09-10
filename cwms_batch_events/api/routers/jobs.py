from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import NoResultFound

from cwms_batch_events.api.dependencies import (
    get_current_user,
    get_job_database,
    get_job_logger,
    get_job_queue,
)
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_logger.base import JobLogger
from cwms_batch_events.core.models import (
    JobLogs,
    JobRecord,
    JobSource,
    ScriptRunOptions,
    ScriptRunRequest,
)
from cwms_batch_events.core.queue import JobQueue


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def get_jobs_for_user(
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[JobRecord]:
    job_list = job_db.get_jobs_for_user(user.username)
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

    options = ScriptRunOptions(
        office=job.office.lower(), repo_path=job.repo_path, script_slug=job.script_slug
    )
    message = queue.create_job_message(job.id, user.username, JobSource.API, options)
    background_tasks.add_task(queue.send_job_message, message)

    return job


@router.get("/{job_id}")
def get_job_by_id(
    job_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> JobRecord:
    job = job_db.get_job_by_id(job_id)
    if not job:
        raise HTTPException(
            status_code=404, detail=f"No job found for jobId '{job_id}'"
        )
    return job


@router.get("/{job_id}/logs")
def get_logs_for_job(
    job_id: UUID, job_logger: JobLogger = Depends(get_job_logger)
) -> JobLogs:
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
