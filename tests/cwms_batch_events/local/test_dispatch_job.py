from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

import pytest

from cwms_batch_events.api.dependencies import get_job_database, get_job_logger
from cwms_batch_events.api.main import app
from cwms_batch_events.core.auth.service.dependencies import require_internal_auth
from cwms_batch_events.local.dispatcher import LocalJobDispatcher

client = TestClient(app)

mock_db = MagicMock()
mock_logger = MagicMock()

app.dependency_overrides[get_job_database] = lambda: mock_db
app.dependency_overrides[get_job_logger] = lambda: mock_logger
app.dependency_overrides[require_internal_auth] = lambda: True


def test_dispatcher_fires_local_runner():
    message = MagicMock()
    message.runner_type = "docker-local"

    mock_db = MagicMock()
    mock_logger = MagicMock()

    with patch("cwms_batch_events.local.dispatcher.LocalExecutor") as MockLocalRunner:
        instance = MockLocalRunner.return_value
        instance.run_job.return_value = None

        dispatcher = LocalJobDispatcher(mock_db, mock_logger)
        dispatcher.dispatch_job(message)

        MockLocalRunner.assert_called_once_with(mock_db, mock_logger, None)
        instance.run_job.assert_called_once_with(message)


def test_dispatcher_missing_runner():
    message = MagicMock()
    message.runner_type = "unknown"

    dispatcher = LocalJobDispatcher(MagicMock(), MagicMock())

    with pytest.raises(ValueError):
        dispatcher.dispatch_job(message)
