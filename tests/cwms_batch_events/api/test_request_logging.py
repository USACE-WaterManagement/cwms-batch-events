import logging

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from cwms_batch_events.api.request_logging import RequestLoggingMiddleware
from cwms_batch_events.core.logging_config import request_id


def test_request_levels_correlation_and_safe_route_templates(caplog):
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/items/{item_id}")
    def get_item(item_id: str):
        assert request_id.get()
        return {}

    @app.post("/items")
    def create_item():
        return {}

    @app.get("/forbidden")
    def forbidden():
        raise HTTPException(403)

    @app.get("/crash")
    def crash():
        raise ValueError("sensitive exception payload")

    with caplog.at_level(logging.DEBUG, logger="cwms_batch_events.api.request_logging"), TestClient(app, raise_server_exceptions=False) as client:
        first = client.get("/items/private-id?token=private-token", headers={"Authorization": "Bearer private-token"})
        second = client.post("/items", json={"password": "private-password"})
        client.get("/forbidden")
        client.get("/crash")
        client.get("/private-path")
    records = [r for r in caplog.records if getattr(r, "event", None) == "http_request"]
    assert [r.levelname for r in records] == ["DEBUG", "INFO", "WARNING", "ERROR", "WARNING"]
    assert [r.route for r in records] == ["/items/{item_id}", "/items", "/forbidden", "/crash", "<unmatched>"]
    assert records[3].error_type == "ValueError"
    assert first.headers["x-request-id"] != second.headers["x-request-id"]
    assert request_id.get() is None
    assert all(r.duration_ms >= 0 for r in records)
    assert all("private" not in r.getMessage() and "sensitive" not in r.getMessage() for r in records)
