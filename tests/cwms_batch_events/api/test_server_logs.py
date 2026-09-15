from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError, NoCredentialsError

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.api.main import app
from cwms_batch_events.api.routers import server_logs


@pytest.fixture
def logs(monkeypatch):
    mock = MagicMock()
    mock.filter_log_events.return_value = {"events": []}
    monkeypatch.setattr(server_logs, "get_server_log_client", lambda: mock)
    return mock


def test_authentication_precedes_cloudwatch(client, logs):
    app.dependency_overrides.pop(get_current_user)
    assert client.get("/server-logs").status_code in (401, 403)
    logs.filter_log_events.assert_not_called()


def test_rich_events_and_fixed_scope(client, logs):
    logs.filter_log_events.return_value = {"events": [{
        "eventId": "event-1", "timestamp": 100, "ingestionTime": 200,
        "logStreamName": "ecs/api/task", "message": '{"level":"warn","message":"Queue delay","duration":123}',
    }], "nextToken": "page-2"}
    response = client.get("/server-logs?start_time=0&end_time=1000&log_group=other")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["entries"][0]["level"] == "WARNING"
    assert data["entries"][0]["fields"]["duration"] == 123
    assert data["entries"][0]["ingestionTime"] == 200
    assert data["nextCursor"] == "page-2"
    logs.filter_log_events.assert_called_once_with(
        logGroupName=server_logs.settings.server_log_group,
        logStreamNamePrefix=server_logs.settings.server_log_stream_prefix,
        startTime=0, endTime=1000, limit=200, unmask=False,
    )


def test_empty_page_preserves_continuation(client, logs):
    logs.filter_log_events.return_value = {"events": [], "nextToken": "more"}
    result = client.get("/server-logs?cursor=previous&start_time=0&end_time=1000").json()
    assert result["entries"] == []
    assert result["nextCursor"] == "more"
    assert logs.filter_log_events.call_args.kwargs["nextToken"] == "previous"


@pytest.mark.parametrize("query", ["cursor=x", "start_time=0&end_time=86400001", "start_time=10&end_time=9", "start_time=-1"])
def test_invalid_windows_do_not_call_aws(client, logs, query):
    assert client.get(f"/server-logs?{query}").status_code in (400, 422)
    logs.filter_log_events.assert_not_called()


@pytest.mark.parametrize("error", [NoCredentialsError(), ClientError({"Error": {"Code": "AccessDeniedException", "Message": "private details"}}, "FilterLogEvents")])
def test_aws_failure_is_not_empty_success(client, logs, error):
    logs.filter_log_events.side_effect = error
    response = client.get("/server-logs")
    assert response.status_code == 503
    assert "private details" not in response.text


def test_expired_cursor(client, logs):
    logs.filter_log_events.side_effect = ClientError({"Error": {"Code": "InvalidParameterException"}}, "FilterLogEvents")
    assert client.get("/server-logs?cursor=x&start_time=0&end_time=1000").status_code == 400


@pytest.mark.parametrize(("message", "level"), [
    ("2026-09-14 [ERROR] example: failed\ntraceback", "ERROR"),
    ("INFO:     Started server", "INFO"),
    ('{"levelname":"DEBUG","message":"test"}', "DEBUG"),
    ('{"severity":"fatal"}', "CRITICAL"),
    ('["INFO"]', "UNKNOWN"),
    ("ordinary output", "UNKNOWN"),
])
def test_log_level_formats(message, level):
    entry = server_logs.parse_entry({"eventId": "1", "timestamp": 1, "logStreamName": "s", "message": message})
    assert entry.level == level
    assert entry.message == message
