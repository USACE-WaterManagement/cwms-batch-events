import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from cwms_batch_events.api.dependencies import get_current_user, get_db_session
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import CamelModel
from cwms_batch_events.core.settings import get_settings

settings = get_settings()


router = APIRouter(prefix="/about", tags=["about"])
logger = logging.getLogger(__name__)


class UserAccess(CamelModel):
    username: str
    offices: list[str]
    admin_offices: list[str]
    roles: dict[str, list[str]]


class ApplicationInfo(CamelModel):
    name: str
    api_version: str
    environment: str
    build_revision: str
    build_time: str | None
    authentication_environment: str
    job_runner: str
    root_path: str
    user: UserAccess


class SchemaInfo(CamelModel):
    name: str
    version: str
    description: str
    installed_on: datetime


@router.get("/application", response_model=ApplicationInfo)
def get_application_info(
    user: User = Depends(get_current_user),
) -> ApplicationInfo:
    return ApplicationInfo(
        name="CWMS Batch Events",
        api_version=settings.api_version,
        environment=settings.deployment_environment,
        build_revision=settings.build_revision,
        build_time=settings.build_time,
        authentication_environment=settings.auth_environment or "local mock",
        job_runner=settings.default_job_runner,
        root_path=settings.root_path or "/",
        user=UserAccess(
            username=user.username,
            offices=user.offices,
            admin_offices=user.admin_offices,
            roles=user.roles,
        ),
    )


@router.get("/schema", response_model=SchemaInfo)
def get_schema_info(
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SchemaInfo:
    schema_name = '"' + settings.database_schema.replace('"', '""') + '"'
    try:
        migration = (
            db.execute(
                text(
                    f"""
                    SELECT version, description, installed_on
                    FROM {schema_name}.flyway_schema_history
                    WHERE success = TRUE AND version IS NOT NULL
                    ORDER BY installed_rank DESC
                    LIMIT 1
                    """
                )
            )
            .mappings()
            .one_or_none()
        )
    except SQLAlchemyError as exc:
        logger.exception(
            "Unable to read schema version from %s",
            settings.database_schema,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Schema version is currently unavailable",
        ) from exc

    if migration is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No applied schema version was found",
        )

    return SchemaInfo(
        name=settings.database_schema,
        version=migration["version"],
        description=migration["description"],
        installed_on=migration["installed_on"],
    )
