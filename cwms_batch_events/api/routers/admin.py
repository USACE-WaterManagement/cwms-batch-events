"""HQ operations reporting from stored job records, without AWS billing calls."""
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from cwms_batch_events.api.dependencies import get_current_user, get_db_session
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import CamelModel

router = APIRouter(prefix="/admin", tags=["administration"])


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
    OR (job_status='Running' AND coalesce(run_time,created_time) < :run_cutoff))"""


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
    if "Data Acquisition Mgr" not in user.roles.get("HQ", []):
        raise HTTPException(403, "HQ Data Acquisition Mgr role required")
    now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
    since = now - timedelta(days=days)
    params = dict(now=now, since=since, office=office.upper() if office else None,
        queue_cutoff=now-timedelta(minutes=queue_minutes), run_cutoff=now-timedelta(minutes=run_minutes))
    def rows(sql):
        return list(db.execute(text(sql), params).mappings())
    offices = list(db.scalars(text("""SELECT office FROM scripts UNION SELECT office FROM jobs
        WHERE (created_time >= :since AND created_time <= :now) OR job_status IN ('Pending','Running') ORDER BY office"""), params))
    usage = rows(f"SELECT office, {USAGE_COLUMNS} FROM jobs WHERE {WINDOW} GROUP BY office ORDER BY runtime_minutes DESC, office")
    task_order = TASK_SORT_COLUMNS[task_sort]
    direction = "ASC" if task_direction == "asc" else "DESC"
    limit = "" if params["office"] else "LIMIT 20"
    tie_breaker = "script_name ASC" if task_sort == "name" else "script_name ASC, script_id"
    top = rows(f"SELECT office, script_id, script_name AS name, {USAGE_COLUMNS} FROM jobs WHERE {WINDOW} GROUP BY office,script_id,script_name ORDER BY {task_order} {direction} NULLS LAST, {tie_breaker} {limit}")
    daily = rows(f"SELECT to_char(created_time AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, count(*) AS runs, count(*) FILTER (WHERE job_status='Failed') AS failed FROM jobs WHERE {WINDOW} GROUP BY day ORDER BY day")
    attention = rows(f"""SELECT id,office,script_name AS name,job_status AS status,
        extract(epoch FROM (:now - coalesce(run_time,created_time)))/60.0 AS age_minutes,
        batch_checked_at FROM jobs WHERE {SCOPE} AND {ATTENTION}
        ORDER BY coalesce(run_time,created_time),id LIMIT 50""")
    failures = rows(f"""SELECT id,office,script_name AS name,job_status AS status,
        extract(epoch FROM (:now-created_time))/60.0 AS age_minutes,
        batch_checked_at,batch_status_reason AS reason FROM jobs WHERE {WINDOW}
        AND job_status='Failed' ORDER BY created_time DESC,id LIMIT 50""")
    counts = rows(f"SELECT count(*) FILTER (WHERE job_status='Pending') AS queued, count(*) FILTER (WHERE job_status='Running') AS running, count(*) FILTER (WHERE {ATTENTION}) AS attention_total FROM jobs WHERE {SCOPE} AND job_status IN ('Pending','Running')")[0]
    registrations = rows(f"SELECT count(*) AS registered, count(*) FILTER (WHERE active AND schedule_enabled AND config_version=4) AS automatic FROM scripts WHERE {SCOPE}")[0]
    return OperationsSummary(as_of=now, since=since, offices=offices, usage=usage,
        top_jobs=top, daily=daily, attention=attention, failures=failures, **counts, **registrations)
