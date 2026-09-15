from uuid import UUID

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


@router.get(
    "",
    responses={200: {"headers": {
        "X-Total-Count": {
            "description": "Total jobs for the current user when pagination is requested.",
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
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[JobRecord]:
    if limit is not None or offset:
        response.headers["X-Total-Count"] = str(job_db.count_jobs_for_user(user.username))
        return job_db.get_jobs_for_user(user.username, limit=limit, offset=offset)
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
    except UnsupportedConfigVersion as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The saved script has invalid execution settings. Correct its path and arguments in Scripts Manager before running it.",
        ) from exc

    options = ScriptRunOptions(
        config_version=job.config_version,
        office=job.office.lower(),
        repo_path=job.repo_path,
        script_slug=job.script_slug,
        execution_type=job.execution_type,
        runtime=job.runtime,
        command_args=job.command_args,
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
    job = job_db.get_job_by_id(job_id)
    if not job:
        raise HTTPException(
            status_code=404, detail=f"No job found for jobId '{job_id}'"
        )
    if isinstance(job_logger, CloudWatchJobLogger):
        return job_logger.refresh_job(job_id)
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


@router.get("/{job_id}/logs/page")
def get_log_page(
    job_id: UUID,
    cursor: str | None = Query(default=None, max_length=16384),
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
    job_logger: JobLogger = Depends(get_job_logger),
) -> JobLogPage:
    """Read a bounded log page. Pass nextCursor to retrieve subsequent output."""
    job = job_db.get_job_by_id(job_id)
    # Match the user-scoped jobs list; never use a cursor as authorization.
    if not job or job.username != user.username:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        return job_logger.get_log_page(job_id, cursor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid log cursor. Refresh the logs.") from exc
