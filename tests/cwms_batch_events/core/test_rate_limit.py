import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cwms_batch_events.core.rate_limit import OfficeRateLimit, OfficeRateLimitStore, RateLimitMiddleware


def make_client(*, api_limit=2, job_limit=1, store=None):
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=api_limit,
        job_submissions_per_minute=job_limit,
        documentation_url="/events/about/rate-limits",
        office_rate_limit_store=store,
    )

    @app.get("/jobs")
    def jobs():
        return {"ok": True}

    @app.post("/jobs")
    def submit_job():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"ok": True}

    return TestClient(app)


def test_rate_limit_returns_documentation_link_and_retry_header():
    with make_client(api_limit=1) as client:
        headers = {"Authorization": "apikey stable-test-key"}
        assert client.get("/jobs", headers=headers).status_code == 200
        response = client.get("/jobs", headers=headers)

    assert response.status_code == 429
    assert response.headers["Retry-After"].isdigit()
    assert response.json()["detail"] == {
        "code": "rate_limit_exceeded",
        "message": "Request limit exceeded for /jobs",
        "requestUrl": "/jobs",
        "documentationUrl": "/events/about/rate-limits",
        "limit": 1,
        "windowSeconds": 60,
        "retryAfterSeconds": int(response.headers["Retry-After"]),
    }


def test_job_submission_has_a_separate_lower_limit():
    with make_client(api_limit=10, job_limit=1) as client:
        headers = {"Authorization": "apikey stable-test-key"}
        assert client.post("/jobs", headers=headers).status_code == 200
        assert client.post("/jobs", headers=headers).status_code == 429


def test_health_is_not_rate_limited():
    with make_client(api_limit=1) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/health").status_code == 200


def test_office_override_applies_to_selected_office():
    store = OfficeRateLimitStore(OfficeRateLimit(10, 5), session_factory=lambda: None)
    store.set("SWT", OfficeRateLimit(1, 1))
    store._last_refresh = time.monotonic()
    with make_client(store=store) as client:
        headers = {"Authorization": "apikey stable-test-key"}
        assert client.get("/jobs?office=SWT", headers=headers).status_code == 200
        assert client.get("/jobs?office=SWT", headers=headers).status_code == 429
