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
    assert server_logs.decode_cursor(data["nextCursor"], server_logs.cursor_scope(0, 1000, "ALL")) == "page-2"
    logs.filter_log_events.assert_called_once_with(
        logGroupName=server_logs.settings.server_log_group,
        logStreamNamePrefix=server_logs.settings.server_log_stream_prefix,
        startTime=0, endTime=1000, limit=200, unmask=False,
    )


def test_empty_page_preserves_continuation(client, logs):
    logs.filter_log_events.return_value = {"events": [], "nextToken": "more"}
    result = client.get("/server-logs?start_time=0&end_time=1000").json()
    assert result["entries"] == []
    client.get("/server-logs", params={"cursor": result["nextCursor"], "start_time": 0, "end_time": 1000})
    assert logs.filter_log_events.call_args.kwargs["nextToken"] == "more"


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
    logs.filter_log_events.return_value = {"events": [], "nextToken": "expired"}
    cursor = client.get("/server-logs?start_time=0&end_time=1000").json()["nextCursor"]
    logs.filter_log_events.side_effect = ClientError({"Error": {"Code": "InvalidParameterException"}}, "FilterLogEvents")
    assert client.get("/server-logs", params={"cursor": cursor, "start_time": 0, "end_time": 1000}).status_code == 400


@pytest.mark.parametrize("level", ["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])
def test_cloudwatch_filters_levels_and_scopes_cursors(client, logs, level):
    logs.filter_log_events.return_value = {"events": [], "nextToken": "next"}
    params = {"start_time": 0, "end_time": 1000, "level": level}
    response = client.get("/server-logs", params=params)
    assert response.status_code == 200
    assert logs.filter_log_events.call_args.kwargs["filterPattern"] == '{ $.level = "' + level + '" }'
    params["cursor"] = response.json()["nextCursor"]
    assert client.get("/server-logs", params=params).status_code == 200
    assert logs.filter_log_events.call_args.kwargs["nextToken"] == "next"
    logs.reset_mock()
    assert client.get("/server-logs", params=params | {"level": "ALL"}).status_code == 400
    assert client.get("/server-logs", params=params | {"end_time": 1001}).status_code == 400
    logs.filter_log_events.assert_not_called()


def test_unknown_scans_one_page_and_preserves_cursor(client, logs):
    logs.filter_log_events.return_value = {"events": [
        {"eventId": "1", "timestamp": 1, "logStreamName": "s", "message": "plain output"},
        {"eventId": "2", "timestamp": 1, "logStreamName": "s", "message": '{"level":"INFO"}'},
    ], "nextToken": "more"}
    response = client.get("/server-logs?level=UNKNOWN").json()
    assert [entry["eventId"] for entry in response["entries"]] == ["1"]
    assert response["nextCursor"]
    assert "filterPattern" not in logs.filter_log_events.call_args.kwargs
    assert logs.filter_log_events.call_count == 1


@pytest.mark.parametrize(("message", "level"), [
    ("2026-09-14 [ERROR] example: failed\ntraceback", "ERROR"),
    ("INFO:     Started server", "INFO"),
    ('{"levelname":"DEBUG","message":"test"}', "DEBUG"),
    ('{"severity":"fatal"}', "CRITICAL"),
    ('["INFO"]', "UNKNOWN"),
    ("ordinary output", "UNKNOWN"),
    ("2026-09-14 12:00:00,123 INFO: Started dispatcher", "INFO"),
    ("[2026-09-14 12:00:00 +0000] [12] [INFO] Booting worker", "INFO"),
    ("[WARNING]\t2026-09-14T12:00:00Z\trequest-id\tQueue delay", "WARNING"),
    ('{"logLevel":"debug","message":"probe"}', "DEBUG"),
    ("INFO application: started", "INFO"),
    ("Traceback line mentioning [ERROR] in user output", "UNKNOWN"),
])
def test_log_level_formats(message, level):
    entry = server_logs.parse_entry({"eventId": "1", "timestamp": 1, "logStreamName": "s", "message": message})
    assert entry.level == level
    assert entry.message == message
