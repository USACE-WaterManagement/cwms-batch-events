from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import NoResultFound, SQLAlchemyError

from cwms_batch_events.api.dependencies import get_current_user, get_job_database
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_database.postgres.postgres import (
    SlugError,
    TemplateInUseError,
)
from cwms_batch_events.core.models import (
    NotificationPreviewRequest,
    CdaUserListRead,
    NotificationTemplateCreate,
    NotificationTemplateRead,
    NotificationTemplateUpdate,
    RenderedNotification,
    ScriptNotificationRuleCreate,
    ScriptNotificationRuleRead,
    ScriptNotificationRuleUpdate,
)
from cwms_batch_events.core.notifications import (
    build_job_failure_data,
    get_cda_user_lists,
    render_notification,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def check_user_office_admin(user: User, office: str):
    if office not in user.admin_offices:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User does not have script admin access for office '{office}'",
        )


def map_write_error(e: Exception):
    if isinstance(e, NoResultFound):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification resource not found"
        )
    if isinstance(e, PermissionError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    if isinstance(e, SlugError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    if isinstance(e, TemplateInUseError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    if isinstance(e, SQLAlchemyError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notification database is unavailable; migrations may still be running",
        )
    if isinstance(e, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        )
    raise e


def map_read_error(e: Exception):
    if isinstance(e, NoResultFound):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification resource not found"
        )
    if isinstance(e, PermissionError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    if isinstance(e, SQLAlchemyError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notification database is unavailable; migrations may still be running",
        )
    raise e


@router.get("/templates")
def get_templates(
    office: str,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[NotificationTemplateRead]:
    check_user_office_admin(user, office)
    try:
        return job_db.get_notification_templates_for_office(office)
    except Exception as e:
        map_read_error(e)


@router.get("/cda-user-lists")
def get_available_cda_user_lists(
    office: str,
    user: User = Depends(get_current_user),
) -> list[CdaUserListRead]:
    check_user_office_admin(user, office)
    try:
        return get_cda_user_lists(office)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"CDA user lists are unavailable: {e}",
        )


@router.post("/templates")
def post_template(
    payload: NotificationTemplateCreate,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> NotificationTemplateRead:
    check_user_office_admin(user, payload.office)
    try:
        return job_db.store_notification_template(payload)
    except Exception as e:
        map_write_error(e)


@router.put("/templates/{template_id}")
def put_template(
    template_id: UUID,
    payload: NotificationTemplateUpdate,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> NotificationTemplateRead:
    try:
        return job_db.update_notification_template(
            template_id, payload, user.admin_offices
        )
    except Exception as e:
        map_write_error(e)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        job_db.remove_notification_template_if_allowed(template_id, user.admin_offices)
    except Exception as e:
        map_write_error(e)


@router.post("/templates/{template_id}/preview")
def preview_template(
    template_id: UUID,
    payload: NotificationPreviewRequest,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> RenderedNotification:
    try:
        template = job_db.get_notification_template_if_allowed(
            template_id, user.admin_offices
        )
    except Exception as e:
        map_read_error(e)

    data = payload.data
    if payload.job_id is not None:
        job = job_db.get_job_by_id(payload.job_id)
        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {payload.job_id} not found",
            )
        check_user_office_admin(user, job.office)
        data = build_job_failure_data(job) | data

    return render_notification(
        subject_template=payload.subject_template or template.subject_template,
        body_template=payload.body_template or template.body_template,
        recipients=[],
        data=data,
    )


@router.get("/rules")
def get_rules(
    script_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> list[ScriptNotificationRuleRead]:
    try:
        return job_db.get_script_notification_rules(script_id, user.admin_offices)
    except Exception as e:
        map_read_error(e)


@router.post("/rules")
def post_rule(
    payload: ScriptNotificationRuleCreate,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> ScriptNotificationRuleRead:
    try:
        return job_db.store_script_notification_rule(payload, user.admin_offices)
    except Exception as e:
        map_write_error(e)


@router.put("/rules/{rule_id}")
def put_rule(
    rule_id: UUID,
    payload: ScriptNotificationRuleUpdate,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
) -> ScriptNotificationRuleRead:
    try:
        return job_db.update_script_notification_rule(
            rule_id, payload, user.admin_offices
        )
    except Exception as e:
        map_write_error(e)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: UUID,
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
):
    try:
        job_db.remove_script_notification_rule_if_allowed(rule_id, user.admin_offices)
    except Exception as e:
        map_write_error(e)
