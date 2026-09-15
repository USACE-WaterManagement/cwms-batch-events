"""One JSON event per line, with bounded, non-payload diagnostic fields."""
import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone

from cwms_batch_events.core.settings import settings

request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
FIELDS = (
    "event", "job_id", "external_job_id", "script_id", "office", "status",
    "previous_status", "batch_status", "stream_available", "error_type",
    "aws_error_code", "method", "route", "status_code", "duration_ms", "count",
    "has_more", "exit_code",
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname, "logger": record.name,
            "message": record.getMessage(), "process": record.process,
        }
        data.update({key: getattr(record, key) for key in FIELDS if hasattr(record, key)})
        if correlation := request_id.get():
            data["request_id"] = correlation
        if record.exc_info:
            # Exception strings and source lines can contain SQL parameters,
            # tokens or payloads. Retain exception type and stack locations only.
            data["error_type"] = record.exc_info[0].__name__
            data["stack"] = [
                {"file": frame.filename, "line": frame.lineno, "function": frame.name}
                for frame in traceback.extract_tb(record.exc_info[2])
            ]
        return json.dumps(data, default=str, ensure_ascii=True)


def configure_logging(*, api: bool = False) -> None:
    """Reuse Lambda/root sinks, and replace server-specific plaintext handlers."""
    level = settings.log_level.upper()
    if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        level = "INFO"
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(logging.StreamHandler(sys.stdout))
    for handler in root.handlers:
        handler.setFormatter(JsonFormatter())
    # DEBUG is for our application, not SDK wire traces or database parameters.
    root.setLevel(logging.WARNING)
    logging.getLogger("cwms_batch_events").setLevel(level)
    if api:
        for name in ("uvicorn", "uvicorn.error", "gunicorn.error"):
            logger = logging.getLogger(name)
            logger.handlers.clear()
            logger.propagate = True
            logger.setLevel(level)
        # Our request middleware replaces raw access logs (which include URLs).
        for name in ("uvicorn.access", "gunicorn.access"):
            logger = logging.getLogger(name)
            logger.handlers.clear()
            logger.addHandler(logging.NullHandler())
            logger.propagate = False

