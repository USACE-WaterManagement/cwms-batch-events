"""One JSON event per line, with bounded, non-payload diagnostic fields."""
import json
import logging
import sys
import traceback
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from cwms_batch_events.core.settings import LoggingSettings, get_settings

settings = get_settings(LoggingSettings)

request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
log_context: ContextVar[dict] = ContextVar("log_context", default={})
FIELDS = (
    "event", "job_id", "external_job_id", "script_id", "office", "status",
    "previous_status", "batch_status", "stream_available", "error_type",
    "aws_error_code", "method", "route", "status_code", "duration_ms", "count",
    "has_more", "exit_code",
)


@lru_cache
def build_metadata() -> dict:
    path = Path(__file__).resolve().parents[1] / "build-info.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


@contextmanager
def bind_log_context(**fields):
    token = log_context.set({**log_context.get(), **fields})
    try:
        yield
    finally:
        log_context.reset(token)


def common_fields(record: logging.LogRecord, service: str | None = None) -> dict:
    metadata = build_metadata()
    data = {
        "service": service or settings.service_name,
        "environment": metadata.get("environment", settings.deployment_environment),
        "version": metadata.get("version", settings.build_revision),
        "logger": record.name, "process": record.process,
        "request_id": request_id.get(),
        **log_context.get(),
    }
    data.update({key: getattr(record, key) for key in FIELDS if hasattr(record, key)})
    data["correlation_id"] = data.get("job_id") or data.get("external_job_id") or data.get("request_id") or data.get("function_request_id")
    return {key: value for key, value in data.items() if value is not None}


def exception_fields(record: logging.LogRecord) -> dict:
    if not record.exc_info:
        return {}
    # Exception strings/source lines can contain SQL parameters or credentials.
    return {
        "error_type": record.exc_info[0].__name__,
        "stack": [{"file": frame.filename, "line": frame.lineno, "function": frame.name}
                  for frame in traceback.extract_tb(record.exc_info[2])],
    }


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str | None = None):
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        data = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname, "logger": record.name,
            "message": record.getMessage(), **common_fields(record, self.service),
        }
        data.update(exception_fields(record))
        return json.dumps(data, default=str, ensure_ascii=True)


def configure_logging(*, api: bool = False, service: str | None = None) -> None:
    """Reuse Lambda/root sinks, and replace server-specific plaintext handlers."""
    level = settings.log_level.upper()
    if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        level = "INFO"
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(logging.StreamHandler(sys.stdout))
    for handler in root.handlers:
        handler.setFormatter(JsonFormatter(service))
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
