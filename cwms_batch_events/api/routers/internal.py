from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID


from cwms_batch_events.core.auth.service.dependencies import require_internal_auth
from cwms_batch_events.api.dependencies import (
    get_job_database,
)
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.models import (
    BatchJobStatusUpdateRequest,
    BindExternalJobIdRequest,
)
from cwms_batch_events.core.processing import update_batch_job_status

router = APIRouter(prefix="/internal", include_in_schema=False)


@router.post("/document/scan/{scan_id}/external-job-id", status_code=204)
def bind_scan_job(
    scan_id: UUID, payload: BindExternalJobIdRequest, _=Depends(require_internal_auth)
):
    from cwms_batch_events.api.routers.document_scan import query

    rows = query(
        """UPDATE document_scans SET external_job_id=COALESCE(external_job_id,:external)
        WHERE id=:id RETURNING id""",
        id=scan_id,
        external=payload.external_job_id,
    )
    if not rows:
        raise HTTPException(404, "Scan not found")


@router.post(
    "/batch-jobs/{batch_job_id}/status",
    status_code=status.HTTP_204_NO_CONTENT,
)
def update_batch_job_status_endpoint(
    batch_job_id: str,
    payload: BatchJobStatusUpdateRequest,
    _=Depends(require_internal_auth),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        update_batch_job_status(
            batch_job_id, payload.status, payload.event_time, job_db
        )

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    except Exception as e:
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
