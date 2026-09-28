import hashlib
import json
import logging
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from cwms_batch_events.core.job_database.postgres.session import create_session

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OfficeRateLimit:
    requests_per_minute: int
    job_submissions_per_minute: int


@dataclass(frozen=True)
class OfficeRateLimitRecord:
    limits: OfficeRateLimit
    changed_by: str | None = None
    changed_at: datetime | None = None


@dataclass(frozen=True)
class RateLimitStatus:
    limit: int
    used: int
    remaining: int
    reset_after_seconds: int


class OfficeRateLimitStore:
    """Persisted office overrides with a short refresh window for API workers."""

    def __init__(self, defaults: OfficeRateLimit, session_factory=create_session):
        self.defaults = defaults
        self.session_factory = session_factory
        self._overrides: dict[str, OfficeRateLimitRecord] = {}
        self._last_refresh = 0.0
        self._lock = Lock()
        self._request_counters: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._request_lock = Lock()

    def consume(self, caller_key: str, office_key: str, policy: str, limit: int) -> tuple[bool, int, int]:
        key = (f"{caller_key}:{office_key}", policy)
        now = time.monotonic()
        with self._request_lock:
            timestamps = self._request_counters[key]
            while timestamps and timestamps[0] <= now - 60:
                timestamps.popleft()
            if len(timestamps) >= limit:
                return False, max(1, math.ceil(60 - (now - timestamps[0]))), 0
            timestamps.append(now)
            return True, 0, limit - len(timestamps)

    def status(self, caller_key: str | None, office_key: str, policy: str, limit: int) -> RateLimitStatus:
        if caller_key is None:
            return RateLimitStatus(limit=limit, used=0, remaining=limit, reset_after_seconds=0)
        key = (f"{caller_key}:{office_key}", policy)
        now = time.monotonic()
        with self._request_lock:
            timestamps = self._request_counters[key]
            while timestamps and timestamps[0] <= now - 60:
                timestamps.popleft()
            used = len(timestamps)
            reset_after = math.ceil(60 - (now - timestamps[0])) if timestamps else 0
        return RateLimitStatus(limit=limit, used=used, remaining=max(0, limit - used), reset_after_seconds=max(0, reset_after))

    def get(self, offices: list[str]) -> OfficeRateLimit:
        if not offices:
            return self.defaults
        self._refresh_if_due()
        with self._lock:
            limits = [
                self._overrides.get(office.upper(), OfficeRateLimitRecord(self.defaults)).limits
                for office in offices
            ]
        return OfficeRateLimit(
            requests_per_minute=min(limit.requests_per_minute for limit in limits),
            job_submissions_per_minute=min(limit.job_submissions_per_minute for limit in limits),
        )

    def set(
        self,
        office: str,
        limits: OfficeRateLimit,
        changed_by: str | None = None,
        changed_at: datetime | None = None,
    ) -> None:
        with self._lock:
            self._overrides[office.upper()] = OfficeRateLimitRecord(limits, changed_by, changed_at)

    def remove(self, office: str) -> None:
        with self._lock:
            self._overrides.pop(office.upper(), None)

    def snapshot(self) -> dict[str, OfficeRateLimitRecord]:
        self._refresh_if_due(force=True)
        with self._lock:
            return dict(self._overrides)

    def office_for_script(self, script_id: UUID) -> str | None:
        try:
            with self.session_factory() as db:
                office = db.scalar(text("SELECT office FROM scripts WHERE id=:script_id"), {"script_id": script_id})
            return office.upper() if office else None
        except SQLAlchemyError as exc:
            logger.warning(
                "Could not resolve the office for a job submission. Using default rate limits",
                extra={"event": "rate_limit_office_lookup_failed", "error_type": type(exc).__name__},
            )
            return None

    def _refresh_if_due(self, force: bool = False) -> None:
        now = time.monotonic()
        with self._lock:
            if not force and now - self._last_refresh < 60:
                return
            self._last_refresh = now
        try:
            with self.session_factory() as db:
                rows = db.execute(text("""SELECT office, requests_per_minute, job_submissions_per_minute,
                    changed_by, changed_at
                    FROM office_rate_limits""")).mappings().all()
            overrides = {
                row["office"]: OfficeRateLimitRecord(
                    OfficeRateLimit(row["requests_per_minute"], row["job_submissions_per_minute"]),
                    row["changed_by"], row["changed_at"],
                )
                for row in rows
            }
            with self._lock:
                self._overrides = overrides
        except SQLAlchemyError as exc:
            # Keep the last known values. Defaults remain available when the
            # table is not present during a rolling migration or the database is down.
            logger.warning(
                "Could not refresh office rate-limit overrides. Keeping the last known policy",
                extra={"event": "rate_limit_overrides_refresh_failed", "error_type": type(exc).__name__},
            )
            return


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply process-local request limits to API callers.

    The credential fingerprint keeps counters stable without retaining bearer
    tokens. Deployments with multiple workers should also apply an equivalent
    limit at the gateway for shared enforcement.
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 120,
        job_submissions_per_minute: int = 10,
        documentation_url: str = "/events/about/rate-limits",
        office_rate_limit_store: OfficeRateLimitStore | None = None,
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.job_submissions_per_minute = job_submissions_per_minute
        self.documentation_url = documentation_url
        self.office_rate_limit_store = office_rate_limit_store or OfficeRateLimitStore(
            OfficeRateLimit(requests_per_minute, job_submissions_per_minute)
        )

    def job_submission_status(self, request: Request, offices: list[str]) -> RateLimitStatus:
        caller_key = self._caller_key(request)
        office_key = ",".join(sorted(set(offices))) or "default"
        limit = self.office_rate_limit_store.get(offices).job_submissions_per_minute
        return self.office_rate_limit_store.status(caller_key, office_key, "job-submission", limit)

    async def dispatch(self, request: Request, call_next):
        if self._is_exempt(request):
            return await call_next(request)

        caller_key = self._caller_key(request)
        if caller_key is None:
            # User-facing routes require Authorization. Let the auth dependency
            # return its normal 401 rather than sharing one anonymous counter.
            return await call_next(request)

        offices = await self._request_offices(request)
        office_limits = self.office_rate_limit_store.get(offices)
        policy, limit = self._policy(request, office_limits)
        office_key = ",".join(sorted(set(offices))) or "default"
        allowed, retry_after, remaining = self.office_rate_limit_store.consume(caller_key, office_key, policy, limit)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": {
                        "code": "rate_limit_exceeded",
                        "message": f"Request limit exceeded for {request.url.path}",
                        "requestUrl": request.url.path,
                        "documentationUrl": self.documentation_url,
                        "limit": limit,
                        "windowSeconds": 60,
                        "retryAfterSeconds": retry_after,
                    }
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

    @staticmethod
    def _is_exempt(request: Request) -> bool:
        path = request.url.path.rstrip("/") or "/"
        return path.endswith(("/health", "/docs", "/redoc", "/openapi.json")) or "/internal" in path

    def _policy(self, request: Request, office_limits: OfficeRateLimit) -> tuple[str, int]:
        if request.method == "POST" and request.url.path.rstrip("/").endswith("/jobs"):
            return "job-submission", office_limits.job_submissions_per_minute
        return "api", office_limits.requests_per_minute

    async def _request_offices(self, request: Request) -> list[str]:
        values = [value.upper() for value in request.query_params.getlist("office") if value]
        if values:
            return values
        if request.method != "POST" or not request.url.path.rstrip("/").endswith("/jobs"):
            return []
        try:
            body = json.loads(await request.body())
            script_id = UUID(str(body.get("scriptId") or body.get("script_id")))
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
        office = self.office_rate_limit_store.office_for_script(script_id)
        return [office] if office else []

    @staticmethod
    def _caller_key(request: Request) -> str | None:
        credential = request.headers.get("authorization") or request.headers.get("x-internal-token")
        if not credential:
            return None
        return "credential:" + hashlib.sha256(credential.encode()).hexdigest()
