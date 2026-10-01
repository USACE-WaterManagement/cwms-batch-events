"""HQ operations reporting from stored job records, without AWS billing calls."""
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID
import logging

import boto3

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from cwms_batch_events.api.dependencies import get_current_user, get_db_session
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import CamelModel
from cwms_batch_events.core.rate_limit import OfficeRateLimit, OfficeRateLimitStore
from cwms_batch_events.core.utils import ALL_OFFICES
from cwms_batch_events.core.settings import get_settings

router = APIRouter(prefix="/admin", tags=["administration"])
logger = logging.getLogger(__name__)


class RateLimitOverride(CamelModel):
    requests_per_minute: int = Field(ge=1, le=10000)
    job_submissions_per_minute: int = Field(ge=1, le=1000)


class RateLimitRow(CamelModel):
    office: str
    requests_per_minute: int
    job_submissions_per_minute: int
    request_override: bool
    job_submission_override: bool
    changed_by: str | None = None
    changed_at: datetime | None = None


class RateLimitHistoryRow(CamelModel):
    id: int
    office: str
    action: Literal["created", "updated", "reset", "legacy"]
    previous_requests_per_minute: int | None = None
    previous_job_submissions_per_minute: int | None = None
    new_requests_per_minute: int | None = None
    new_job_submissions_per_minute: int | None = None
    changed_by: str
    changed_at: datetime


def require_hq_admin(user: User) -> None:
    if "Data Acquisition Mgr" not in user.roles.get("HQ", []):
        raise HTTPException(403, "HQ Data Acquisition Mgr role required")


def require_hq_rate_limit_admin(user: User) -> None:
    if not {"Data Acquisition Mgr", "Data Exchange Mgr"}.intersection(
        user.roles.get("HQ", [])
    ):
        raise HTTPException(403, "HQ Data Acquisition Mgr or Data Exchange Mgr role required")


def rate_limit_store(request: Request) -> OfficeRateLimitStore:
    return request.app.state.rate_limit_store


@router.get("/rate-limits", response_model=list[RateLimitRow])
def get_rate_limits(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    require_hq_rate_limit_admin(user)
    store = rate_limit_store(request)
    database_offices = db.scalars(text("""SELECT office FROM scripts
        UNION SELECT office FROM jobs
        UNION SELECT office FROM office_rate_limits"""))
    offices = sorted({office.upper() for office in ALL_OFFICES} | {
        office.upper() for office in database_offices if office
    })
    overrides = store.snapshot()
    rows = []
    for office in offices:
        limits = store.get([office])
        override = overrides.get(office.upper())
        rows.append(RateLimitRow(
            office=office,
            requests_per_minute=limits.requests_per_minute,
            job_submissions_per_minute=limits.job_submissions_per_minute,
            request_override=override is not None,
            job_submission_override=override is not None,
            changed_by=override.changed_by if override else None,
            changed_at=override.changed_at if override else None,
        ))
    return rows


@router.get("/rate-limits/{office}/history", response_model=list[RateLimitHistoryRow])
def get_rate_limit_history(
    office: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    require_hq_rate_limit_admin(user)
    office = office.upper()
    if not office.isascii() or not office.isalpha() or not 3 <= len(office) <= 4:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Office must be 3-4 letters")
    rows = db.execute(text("""SELECT id, office, action,
        previous_requests_per_minute, previous_job_submissions_per_minute,
        new_requests_per_minute, new_job_submissions_per_minute,
        changed_by, changed_at
        FROM office_rate_limit_history
        WHERE office=:office
        ORDER BY changed_at DESC, id DESC
        LIMIT 100"""), {"office": office}).mappings().all()
    return [RateLimitHistoryRow(**row) for row in rows]


@router.put("/rate-limits/{office}", response_model=RateLimitRow)
def update_rate_limit(
    office: str,
    payload: RateLimitOverride,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    require_hq_rate_limit_admin(user)
    office = office.upper()
    if not office.isascii() or not office.isalpha() or not 3 <= len(office) <= 4:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Office must be 3-4 letters")
    previous = db.execute(text("""SELECT requests_per_minute, job_submissions_per_minute
        FROM office_rate_limits WHERE office=:office FOR UPDATE"""), {"office": office}).mappings().first()
    action = "updated" if previous else "created"
    result = db.execute(text("""INSERT INTO office_rate_limits
        (office, requests_per_minute, job_submissions_per_minute, changed_by, changed_at)
        VALUES (:office, :requests, :jobs, :changed_by, CURRENT_TIMESTAMP)
        ON CONFLICT (office) DO UPDATE SET
          requests_per_minute=EXCLUDED.requests_per_minute,
          job_submissions_per_minute=EXCLUDED.job_submissions_per_minute,
          changed_by=EXCLUDED.changed_by,
          changed_at=CURRENT_TIMESTAMP,
          updated_time=CURRENT_TIMESTAMP
        RETURNING changed_by, changed_at"""), {
        "office": office, "requests": payload.requests_per_minute,
        "jobs": payload.job_submissions_per_minute, "changed_by": user.username,
    })
    audit = result.mappings().one()
    db.execute(text("""INSERT INTO office_rate_limit_history (
        office, action, previous_requests_per_minute, previous_job_submissions_per_minute,
        new_requests_per_minute, new_job_submissions_per_minute, changed_by, changed_at
    ) VALUES (:office, :action, :previous_requests, :previous_jobs,
        :new_requests, :new_jobs, :changed_by, :changed_at)"""), {
        "office": office, "action": action,
        "previous_requests": previous["requests_per_minute"] if previous else None,
        "previous_jobs": previous["job_submissions_per_minute"] if previous else None,
        "new_requests": payload.requests_per_minute, "new_jobs": payload.job_submissions_per_minute,
        "changed_by": audit["changed_by"], "changed_at": audit["changed_at"],
    })
    db.commit()
    limits = OfficeRateLimit(payload.requests_per_minute, payload.job_submissions_per_minute)
    store = rate_limit_store(request)
    store.set(office, limits, audit["changed_by"], audit["changed_at"])
    return RateLimitRow(
        office=office, **payload.model_dump(), request_override=True,
        job_submission_override=True, changed_by=audit["changed_by"], changed_at=audit["changed_at"],
    )


@router.delete("/rate-limits/{office}", status_code=204)
def reset_rate_limit(
    office: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    require_hq_rate_limit_admin(user)
    office = office.upper()
    previous = db.execute(text("""SELECT requests_per_minute, job_submissions_per_minute,
        changed_by, changed_at FROM office_rate_limits WHERE office=:office FOR UPDATE"""), {"office": office}).mappings().first()
    db.execute(text("DELETE FROM office_rate_limits WHERE office=:office"), {"office": office})
    if previous:
        db.execute(text("""INSERT INTO office_rate_limit_history (
            office, action, previous_requests_per_minute, previous_job_submissions_per_minute,
            changed_by, changed_at
        ) VALUES (:office, 'reset', :previous_requests, :previous_jobs, :changed_by, CURRENT_TIMESTAMP)"""), {
            "office": office, "previous_requests": previous["requests_per_minute"],
            "previous_jobs": previous["job_submissions_per_minute"], "changed_by": user.username,
        })
    db.commit()
    rate_limit_store(request).remove(office)


class Usage(CamelModel):
    office: str
    script_id: UUID | None = None
    name: str | None = None
    runs: int
    failed: int
    completed: int
    users: int
    runtime_minutes: float
    missing_duration: int


class DailyUsage(CamelModel):
    day: str
    runs: int
    failed: int


class AttentionJob(CamelModel):
    id: UUID
    office: str
    name: str
    status: str
    age_minutes: float
    batch_checked_at: datetime | None
    reason: str | None = None


class OperationsSummary(CamelModel):
    as_of: datetime
    since: datetime
    offices: list[str]
    usage: list[Usage]
    top_jobs: list[Usage]
    daily: list[DailyUsage]
    attention: list[AttentionJob]
    failures: list[AttentionJob]
    attention_total: int
    queued: int
    running: int
    registered: int
    automatic: int


class QueueJob(CamelModel):
    id: UUID
    office: str
    script_name: str
    username: str
    job_status: str
    created_time: datetime
    run_time: datetime | None = None
    external_job_id: str | None = None
    batch_status: str | None = None
    batch_status_reason: str | None = None
    cancellation_requested_at: datetime | None = None


class QueueOffice(CamelModel):
    office: str
    queued: int
    running: int
    cancelling: int
    dispatch_unknown: int
    submissions_last_minute: int
    submission_limit_per_minute: int
    oldest_queued_at: datetime | None = None
    jobs: list[QueueJob]


class QueueSummary(CamelModel):
    as_of: datetime
    queue_available: bool
    queue_warning: str | None = None
    approximate_messages_available: int | None = None
    approximate_messages_in_flight: int | None = None
    offices: list[QueueOffice]


class ControlAuditRow(CamelModel):
    id: int
    job_id: UUID
    office: str
    requested_by: str
    action: str
    previous_status: str
    resulting_status: str
    reason: str
    response: dict
    created_time: datetime


TASK_SORT_COLUMNS = {
    "minutes": "runtime_minutes",
    "runs": "runs",
    "failures": "failed",
    "users": "users",
    "name": "script_name",
    "missing": "missing_duration",
}


USAGE_COLUMNS = """count(*) AS runs,
    count(*) FILTER (WHERE job_status='Failed') AS failed,
    count(*) FILTER (WHERE job_status='Completed') AS completed,
    count(DISTINCT username) AS users,
    coalesce(sum(extract(epoch FROM (end_time-run_time))/60.0)
      FILTER (WHERE job_status IN ('Completed','Failed') AND end_time >= run_time),0) AS runtime_minutes,
    count(*) FILTER (WHERE job_status IN ('Completed','Failed') AND
      (run_time IS NULL OR end_time IS NULL OR end_time < run_time)) AS missing_duration"""
WINDOW = "created_time >= :since AND created_time <= :now AND (CAST(:office AS text) IS NULL OR office=:office)"
SCOPE = "(CAST(:office AS text) IS NULL OR office=:office)"
ATTENTION = """((job_status='Pending' AND created_time < :queue_cutoff)
    OR (job_status='Running' AND coalesce(run_time,created_time) < :run_cutoff)
    OR job_status IN ('Dispatch unknown','Cancelling'))"""


@router.get("/operations", response_model=OperationsSummary)
def operations(
    days: int = Query(30, ge=1, le=90),
    office: str | None = Query(None, min_length=2, max_length=10),
    queue_minutes: int = Query(15, alias="queueMinutes", ge=1, le=10080),
    run_minutes: int = Query(120, alias="runMinutes", ge=1, le=43200),
    task_sort: str = Query("minutes", alias="taskSort", pattern="^(minutes|runs|failures|users|name|missing)$"),
    task_direction: str = Query("desc", alias="taskDirection", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    require_hq_admin(user)
    now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
    since = now - timedelta(days=days)
    params = dict(now=now, since=since, office=office.upper() if office else None,
        queue_cutoff=now-timedelta(minutes=queue_minutes), run_cutoff=now-timedelta(minutes=run_minutes))
    def rows(sql):
        return list(db.execute(text(sql), params).mappings())
    offices = list(db.scalars(text("""SELECT office FROM scripts UNION SELECT office FROM jobs
        WHERE (created_time >= :since AND created_time <= :now) OR job_status IN ('Pending','Running','Cancelling','Dispatch unknown') ORDER BY office"""), params))
    usage = rows(f"SELECT office, {USAGE_COLUMNS} FROM jobs WHERE {WINDOW} GROUP BY office ORDER BY runtime_minutes DESC, office")
    task_sort_value = task_sort if isinstance(task_sort, str) else "minutes"
    task_direction_value = (
        task_direction if isinstance(task_direction, str) else "desc"
    )
    task_order = TASK_SORT_COLUMNS[task_sort_value]
    direction = "ASC" if task_direction_value == "asc" else "DESC"
    limit = "" if params["office"] else "LIMIT 20"
    tie_breaker = "script_name ASC" if task_sort == "name" else "script_name ASC, script_id"
    top = rows(f"SELECT office, script_id, script_name AS name, {USAGE_COLUMNS} FROM jobs WHERE {WINDOW} GROUP BY office,script_id,script_name ORDER BY {task_order} {direction} NULLS LAST, {tie_breaker} {limit}")
    daily = rows(f"SELECT to_char(created_time AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, count(*) AS runs, count(*) FILTER (WHERE job_status='Failed') AS failed FROM jobs WHERE {WINDOW} GROUP BY day ORDER BY day")
    attention = rows(f"""SELECT id,office,script_name AS name,job_status AS status,
        extract(epoch FROM (:now - coalesce(run_time,created_time)))/60.0 AS age_minutes,
        batch_checked_at,batch_status_reason AS reason FROM jobs WHERE {SCOPE} AND {ATTENTION}
        ORDER BY coalesce(run_time,created_time),id LIMIT 50""")
    failures = rows(f"""SELECT id,office,script_name AS name,job_status AS status,
        extract(epoch FROM (:now-created_time))/60.0 AS age_minutes,
        batch_checked_at,batch_status_reason AS reason FROM jobs WHERE {WINDOW}
        AND job_status='Failed' ORDER BY created_time DESC,id LIMIT 50""")
    counts = rows(f"SELECT count(*) FILTER (WHERE job_status='Pending') AS queued, count(*) FILTER (WHERE job_status='Running') AS running, count(*) FILTER (WHERE {ATTENTION}) AS attention_total FROM jobs WHERE {SCOPE} AND job_status IN ('Pending','Running','Cancelling','Dispatch unknown')")[0]
    registrations = rows(f"SELECT count(*) AS registered, count(*) FILTER (WHERE active AND schedule_enabled AND config_version=4) AS automatic FROM scripts WHERE {SCOPE}")[0]
    return OperationsSummary(as_of=now, since=since, offices=offices, usage=usage,
        top_jobs=top, daily=daily, attention=attention, failures=failures, **counts, **registrations)


def queue_attributes() -> tuple[bool, str | None, int | None, int | None]:
    try:
        settings = get_settings()
        client = boto3.client("sqs", endpoint_url=settings.sqs_endpoint_url)
        url = client.get_queue_url(QueueName="cwms-batch-events")["QueueUrl"]
        attributes = client.get_queue_attributes(
            QueueUrl=url,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        return True, None, int(attributes.get("ApproximateNumberOfMessages", 0)), int(attributes.get("ApproximateNumberOfMessagesNotVisible", 0))
    except Exception as exc:
        logger.warning("Queue attributes unavailable", extra={"event": "queue_attributes_unavailable", "error_type": type(exc).__name__})
        return False, "The SQS queue could not be queried. Stored job state remains available.", None, None


@router.get("/queues", response_model=QueueSummary)
def queues(
    request: Request,
    office: str | None = Query(None, min_length=2, max_length=10),
    script: str | None = Query(None, min_length=1, max_length=200),
    state: str | None = Query(None, pattern="^(Pending|Running|Cancelling|Dispatch unknown)$"),
    minutes: int = Query(1440, ge=1, le=10080),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> QueueSummary:
    require_hq_rate_limit_admin(user)
    now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
    store = rate_limit_store(request)
    office_rows = db.execute(text("""
        WITH known_offices AS (
            SELECT office FROM scripts
            UNION SELECT office FROM jobs
            UNION SELECT office FROM office_rate_limits
        )
        SELECT office,
            count(*) FILTER (WHERE job_status='Pending') AS queued,
            count(*) FILTER (WHERE job_status='Running') AS running,
            count(*) FILTER (WHERE job_status='Cancelling') AS cancelling,
            count(*) FILTER (WHERE job_status='Dispatch unknown') AS dispatch_unknown,
            count(*) FILTER (WHERE created_time >= :minute_ago) AS submissions_last_minute,
            min(created_time) FILTER (WHERE job_status='Pending') AS oldest_queued_at
        FROM known_offices LEFT JOIN jobs USING (office)
        GROUP BY office ORDER BY office
    """), {"minute_ago": now - timedelta(minutes=1)}).mappings().all()
    job_filters = ["job_status IN ('Pending', 'Running', 'Cancelling', 'Dispatch unknown')",
                   "created_time >= :jobs_since"]
    job_params: dict[str, object] = {"jobs_since": now - timedelta(minutes=minutes)}
    if office:
        job_filters.append("office = :jobs_office")
        job_params["jobs_office"] = office.upper()
    if script:
        job_filters.append("script_name ILIKE :jobs_script")
        job_params["jobs_script"] = f"%{script}%"
    if state:
        job_filters.append("job_status = :jobs_state")
        job_params["jobs_state"] = state
    active_rows = db.execute(text(f"""
        SELECT id, office, script_name, username, job_status, created_time, run_time,
            external_job_id, batch_status, batch_status_reason, cancellation_requested_at
        FROM jobs
        WHERE {' AND '.join(job_filters)}
        ORDER BY created_time, id LIMIT 500
    """), job_params).mappings().all()
    by_office: dict[str, list[QueueJob]] = {}
    for row in active_rows:
        by_office.setdefault(row["office"], []).append(QueueJob(**row))
    offices = []
    for row in office_rows:
        limits = store.get([row["office"]])
        offices.append(QueueOffice(
            office=row["office"], queued=row["queued"], running=row["running"],
            cancelling=row["cancelling"], dispatch_unknown=row["dispatch_unknown"],
            submissions_last_minute=row["submissions_last_minute"],
            submission_limit_per_minute=limits.job_submissions_per_minute,
            oldest_queued_at=row["oldest_queued_at"], jobs=by_office.get(row["office"], []),
        ))
    available, warning, messages, in_flight = queue_attributes()
    return QueueSummary(as_of=now, queue_available=available, queue_warning=warning,
                        approximate_messages_available=messages,
                        approximate_messages_in_flight=in_flight, offices=offices)


@router.get("/queues/{job_id}/audit", response_model=list[ControlAuditRow])
def queue_job_audit(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> list[ControlAuditRow]:
    require_hq_rate_limit_admin(user)
    rows = db.execute(text("""
        SELECT id, job_id, office, requested_by, action, previous_status,
            resulting_status, reason, response, created_time
        FROM job_control_audit
        WHERE job_id=:job_id
        ORDER BY created_time DESC, id DESC
        LIMIT 100
    """), {"job_id": job_id}).mappings().all()
    return [ControlAuditRow(**row) for row in rows]
