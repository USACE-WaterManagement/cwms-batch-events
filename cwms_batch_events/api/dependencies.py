from fastapi import Depends

from cwms_batch_events.core.auth.user.dependencies import (
    get_current_user_cwms,
    get_current_user_mock,
)
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.job_database.postgres.session import create_session
from cwms_batch_events.core.job_logger.base import JobLogger
from cwms_batch_events.core.job_logger.cloudwatch import CloudWatchJobLogger
from cwms_batch_events.core.job_logger.s3 import S3JobLogger
from cwms_batch_events.core.queue import JobQueue
from cwms_batch_events.core.settings import get_settings

settings = get_settings()

if settings.mock_user:
    get_current_user = get_current_user_mock
else:
    get_current_user = get_current_user_cwms


def get_db_session():
    db = create_session()
    try:
        yield db
    finally:
        db.close()


def get_job_database(db_session=Depends(get_db_session)) -> JobDatabase:
    return PostgresJobDatabase(db=db_session)


def get_job_logger(db=Depends(get_job_database)) -> JobLogger:
    if settings.default_job_runner == "docker-local":
        return S3JobLogger()
    else:
        return CloudWatchJobLogger(db)


def get_job_queue() -> JobQueue:
    return JobQueue()
