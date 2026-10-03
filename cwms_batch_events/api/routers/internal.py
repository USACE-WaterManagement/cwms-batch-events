from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID
import logging
from pydantic import BaseModel, Field


from cwms_batch_events.core.auth.service.dependencies import require_internal_auth
from cwms_batch_events.api.dependencies import (
    get_job_database,
    get_notification_queue,
)
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import (
    BatchJobStatusUpdateRequest,
    BindExternalJobIdRequest,
)
from cwms_batch_events.core.notification_queue import NotificationQueue
from cwms_batch_events.core.processing import update_batch_job_status

router = APIRouter(prefix="/internal", include_in_schema=False)
logger = logging.getLogger(__name__)


class DispatchFailureRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/jobs/{job_id}/claim-dispatch")
def claim_dispatch(job_id: UUID, _=Depends(require_internal_auth),
                   job_db: JobDatabase = Depends(get_job_database)):
    try:
        return job_db.claim_dispatch(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/dispatch-failure", status_code=204)
def fail_dispatch(job_id: UUID, payload: DispatchFailureRequest,
                  _=Depends(require_internal_auth), job_db: JobDatabase = Depends(get_job_database)):
    try:
        job_db.fail_dispatch(job_id, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/claim-scheduled-dispatch")
def claim_scheduled_dispatch(
    job_id: UUID,
    _=Depends(require_internal_auth),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        return {"claimed": job_db.claim_scheduled_dispatch(job_id)}
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/batch-jobs/{batch_job_id}/status",
    status_code=status.HTTP_204_NO_CONTENT,
)
def update_batch_job_status_endpoint(
    batch_job_id: str,
    payload: BatchJobStatusUpdateRequest,
    _=Depends(require_internal_auth),
    job_db: JobDatabase = Depends(get_job_database),
    notification_queue: NotificationQueue | None = Depends(get_notification_queue),
):
    try:
        update_batch_job_status(
            batch_job_id, payload.status, payload.event_time, job_db,
            notification_queue=notification_queue,
             **({"batch_detail": payload.batch_detail} if payload.batch_detail is not None else {}),
        )

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    except Exception as e:
        logger.exception("Failed to apply Batch status callback", extra={"event": "status_callback_failed", "external_job_id": batch_job_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


@router.post(
    "/jobs/{job_id}/external-job-id",
    status_code=status.HTTP_204_NO_CONTENT,
)
def bind_external_job_id(
    job_id: str,
    payload: BindExternalJobIdRequest,
    _=Depends(require_internal_auth),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        job_db.bind_external_job_id(UUID(job_id), payload.external_job_id)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    except Exception as e:
        logger.exception("Failed to bind external Batch job", extra={"event": "job_bind_failed", "job_id": job_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
