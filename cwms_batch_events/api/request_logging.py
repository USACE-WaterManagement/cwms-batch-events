import logging
import time
from uuid import uuid4

from cwms_batch_events.core.logging_config import request_id

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        correlation = uuid4().hex
        context = request_id.set(correlation)
        started = time.monotonic()
        status = 500
        failure = None

        async def send_response(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message = {**message, "headers": [*message.get("headers", []),
                                                  (b"x-request-id", correlation.encode())]}
            await send(message)

        try:
            await self.app(scope, receive, send_response)
        except Exception as exc:
            failure = type(exc).__name__
            raise
        finally:
            # Never log raw paths, query strings, headers, bodies or user names.
            route = getattr(scope.get("route"), "path", "<unmatched>")
            level = (logging.ERROR if failure or status >= 500 else
                     logging.WARNING if status >= 400 else
                     logging.DEBUG if scope["method"] in {"GET", "HEAD", "OPTIONS"} else logging.INFO)
            try:
                logger.log(level, "HTTP request completed", extra={
                    "event": "http_request", "method": scope["method"], "route": route,
                    "status_code": status, "error_type": failure,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                })
            finally:
                request_id.reset(context)
