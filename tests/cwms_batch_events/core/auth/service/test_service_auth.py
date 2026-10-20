from unittest import mock
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
import pytest
from cwms_batch_events.core.auth.service.dependencies import require_internal_auth

app = FastAPI()


@app.post("/internal")
def internal(_: None = Depends(require_internal_auth)):
    return {"status": "ok"}


client = TestClient(app)


@pytest.fixture
def internal_auth_token():
    with mock.patch(
        "cwms_batch_events.core.auth.service.dependencies.settings.app_key",
        "expected-token",
    ):
        yield "expected-token"


def test_missing_header_returns_401(internal_auth_token):
    r = client.post("/internal")
    assert r.status_code == 401


def test_invalid_token_returns_403(internal_auth_token):
    r = client.post("/internal", headers={"X-Internal-Token": "bad-token"})
    assert r.status_code == 403


def test_valid_token_succeeds(internal_auth_token):
    r = client.post("/internal", headers={"X-Internal-Token": internal_auth_token})
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_missing_app_key_returns_500():
    with mock.patch("cwms_batch_events.core.auth.service.dependencies.settings.app_key", ""):
        r = client.post("/internal", headers={"X-Internal-Token": "anything"})

    assert r.status_code == 500
