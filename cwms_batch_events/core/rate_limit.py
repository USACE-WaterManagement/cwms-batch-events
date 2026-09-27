import hashlib
import time
from collections import defaultdict, deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply process-local request limits to API callers.

    The credential fingerprint keeps buckets stable without retaining bearer
    tokens. Deployments with multiple workers should also apply an equivalent
    limit at the gateway for a shared bucket.
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 120,
        job_submissions_per_minute: int = 20,
        documentation_url: str = "/events/about/rate-limits",
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.job_submissions_per_minute = job_submissions_per_minute
        self.documentation_url = documentation_url
        self._requests: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next):
        if self._is_exempt(request):
            return await call_next(request)

        caller_key = self._caller_key(request)
        if caller_key is None:
            # User-facing routes require Authorization. Let the auth dependency
            # return its normal 401 rather than sharing one anonymous bucket.
            return await call_next(request)

        policy, limit = self._policy(request)
        key = (caller_key, policy)
        now = time.monotonic()
        window = 60.0

        with self._lock:
            timestamps = self._requests[key]
            while timestamps and timestamps[0] <= now - window:
                timestamps.popleft()
            if len(timestamps) >= limit:
                retry_after = max(1, int(window - (now - timestamps[0])) + 1)
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
            timestamps.append(now)
            remaining = limit - len(timestamps)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

    @staticmethod
    def _is_exempt(request: Request) -> bool:
        path = request.url.path.rstrip("/") or "/"
        return path.endswith(("/health", "/docs", "/redoc", "/openapi.json")) or "/internal" in path

    def _policy(self, request: Request) -> tuple[str, int]:
        if request.method == "POST" and request.url.path.rstrip("/").endswith("/jobs"):
            return "job-submission", self.job_submissions_per_minute
        return "api", self.requests_per_minute

    @staticmethod
    def _caller_key(request: Request) -> str | None:
        credential = request.headers.get("authorization") or request.headers.get("x-internal-token")
        if not credential:
            return None
        return "credential:" + hashlib.sha256(credential.encode()).hexdigest()
