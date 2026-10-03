from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from cwms_batch_events.api.dependencies import (
    get_db_session,
    get_current_user,
    get_job_database,
    get_job_logger,
    get_job_queue,
    get_notification_queue,
)
from cwms_batch_events.api.main import app
from cwms_batch_events.core.auth.service.dependencies import require_internal_auth
from cwms_batch_events.core.auth.user.models import User
from tests.factories import make_user


@pytest.fixture
def user() -> User:
    return make_user()


@pytest.fixture
def job_db():
    return MagicMock()


@pytest.fixture
def job_logger():
    return MagicMock()


@pytest.fixture
def job_queue():
    return MagicMock()


@pytest.fixture
def notification_queue():
    return MagicMock()


@pytest.fixture
def db_session():
    return MagicMock()


@pytest.fixture
def client(
    user: User,
    job_db: MagicMock,
    job_logger: MagicMock,
    job_queue: MagicMock,
    notification_queue: MagicMock,
    db_session: MagicMock,
):
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_job_database] = lambda: job_db
    app.dependency_overrides[get_job_logger] = lambda: job_logger
    app.dependency_overrides[get_job_queue] = lambda: job_queue
    app.dependency_overrides[get_notification_queue] = lambda: notification_queue
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[require_internal_auth] = lambda: True

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
