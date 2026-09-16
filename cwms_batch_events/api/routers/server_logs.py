"""Authenticated, bounded reads of the configured API server's CloudWatch logs."""

import json
import base64
import logging
import re
import time
from functools import lru_cache
from typing import Any, Literal

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import CamelModel
from cwms_batch_events.core.settings import get_settings

settings = get_settings()

router = APIRouter(prefix="/server-logs", tags=["server logs"])
LogLevel = Literal["ALL", "TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", "UNKNOWN"]
logger = logging.getLogger(__name__)
# Historical Python, Gunicorn and Lambda prefixes, without treating arbitrary
# words in a message or traceback as a severity.
LEVEL = re.compile(
    r"^\s*(?:\d{4}-\d{2}-\d{2}(?:[T ][\d:.,+Z-]+)?\s+)?"
    r"(?:\[[^\]\r\n]+\]\s*)*\[?"
    r"(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL|FATAL)(?:\]|\s|:)", re.I,
)


class ServerLogEntry(CamelModel):
    event_id: str
    timestamp: int
    ingestion_time: int | None = None
    log_stream_name: str
    level: str
    message: str
    fields: dict[str, Any] | None = None


class ServerLogPage(CamelModel):
    entries: list[ServerLogEntry]
    next_cursor: str | None = None
    start_time: int
    end_time: int
    log_group: str
    level: LogLevel = "ALL"


def cursor_scope(start: int, end: int, level: str) -> dict:
    return {"start": start, "end": end, "level": level,
            "group": settings.server_log_group, "prefix": settings.server_log_stream_prefix}


def decode_cursor(cursor: str, scope: dict) -> str:
    try:
        value = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
        if not isinstance(value, dict) or value.get("scope") != scope or not isinstance(value.get("token"), str) or not value["token"]:
            raise ValueError("Invalid cursor scope")
        return value["token"]
    except (ValueError, TypeError, UnicodeError) as exc:
        raise HTTPException(400, "Log cursor does not match the query. Refresh server logs.") from exc


@lru_cache
def get_server_log_client():
    return boto3.client("logs", config=Config(
        connect_timeout=3, read_timeout=10, retries={"max_attempts": 1},
    ))


def parse_entry(event: dict) -> ServerLogEntry:
    message = event["message"]
    try:
        fields = json.loads(message)
    except (ValueError, TypeError):
        fields = None
    if not isinstance(fields, dict):
        fields = None
    level = next((str(fields[key]).upper() for key in ("level", "levelname", "severity", "logLevel")
                  if fields and fields.get(key) is not None), "")
    if not level:
        match = LEVEL.search(message)
        level = match.group(1).upper() if match else "UNKNOWN"
    level = {"WARN": "WARNING", "FATAL": "CRITICAL"}.get(level, level)
    if level not in {"TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        level = "UNKNOWN"
    return ServerLogEntry(
        event_id=event["eventId"], timestamp=event["timestamp"],
        ingestion_time=event.get("ingestionTime"),
        log_stream_name=event["logStreamName"], level=level,
        message=message, fields=fields,
    )


@router.get("", response_model=ServerLogPage)
def get_server_logs(
    response: Response,
    cursor: str | None = Query(default=None, max_length=16384),
    start_time: int | None = Query(default=None, ge=0),
    end_time: int | None = Query(default=None, ge=0),
    level: LogLevel = Query(default="ALL", description="CloudWatch JSON level; ALL includes historical text. UNKNOWN scans a bounded page for unclassified entries."),
    _user: User = Depends(get_current_user),
) -> ServerLogPage:
    """Read up to 200 events, oldest first, within a maximum 24-hour window.

    Pass nextCursor and the returned startTime/endTime for the next page,
    including after empty pages. Only the server-configured group/prefix is read.
    Named levels filter the canonical JSON level field in CloudWatch before
    pagination. ALL includes historical text. UNKNOWN scans each bounded page.
    """
    response.headers["Cache-Control"] = "no-store"
    if cursor and (start_time is None or end_time is None):
        raise HTTPException(400, "Pagination requires start_time and end_time.")
    end = end_time if end_time is not None else int(time.time() * 1000)
    start = start_time if start_time is not None else max(0, end - 3600000)
    if not 0 < end - start <= 86400000:
        raise HTTPException(400, "Choose a time range greater than zero and no longer than 24 hours.")
    if not settings.server_log_group or not settings.server_log_stream_prefix:
        raise HTTPException(503, "Server logging is not configured.")
    args = dict(
        logGroupName=settings.server_log_group,
        logStreamNamePrefix=settings.server_log_stream_prefix,
        startTime=start, endTime=end, limit=200,
        # Keep CloudWatch data protection masking enabled.
        unmask=False,
    )
    if cursor:
        args["nextToken"] = decode_cursor(cursor, cursor_scope(start, end, level))
    if level not in {"ALL", "UNKNOWN"}:
        args["filterPattern"] = '{ $.level = "' + level + '" }'
    try:
        page = get_server_log_client().filter_log_events(**args)
    except ClientError as exc:
        logger.warning("CloudWatch server log read failed", extra={
            "event": "server_logs_failed", "aws_error_code": exc.response.get("Error", {}).get("Code"),
        })
        if cursor and exc.response.get("Error", {}).get("Code") == "InvalidParameterException":
            raise HTTPException(400, "Log cursor expired or invalid. Refresh server logs.") from exc
        raise HTTPException(503, "Server logs are currently unavailable.") from exc
    except BotoCoreError as exc:
        logger.warning("CloudWatch server log client unavailable", extra={"event": "server_logs_failed", "error_type": type(exc).__name__})
        raise HTTPException(503, "Server logs are currently unavailable.") from exc
    logger.debug("CloudWatch server log page read", extra={"event": "server_logs_read", "count": len(page.get("events", [])), "has_more": bool(page.get("nextToken"))})
    entries = [parse_entry(event) for event in page.get("events", [])]
    next_cursor = None
    if token := page.get("nextToken"):
        next_cursor = base64.urlsafe_b64encode(json.dumps({"scope": cursor_scope(start, end, level), "token": token}).encode()).decode()
    return ServerLogPage(
        entries=[entry for entry in entries if level != "UNKNOWN" or entry.level == "UNKNOWN"],
        next_cursor=next_cursor, start_time=start, end_time=end,
        log_group=settings.server_log_group, level=level,
    )
