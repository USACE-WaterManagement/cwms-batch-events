import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from cwms_batch_events.api.dependencies import get_current_user, get_job_database, get_job_logger
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_logger.base import JobLogger
from cwms_batch_events.core.settings import get_settings

router = APIRouter(tags=["jobs"])
logger = logging.getLogger(__name__)


def sign(state):
    payload = base64.urlsafe_b64encode(json.dumps(state).encode()).decode()
    key = get_settings().app_key.encode()
    signature = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def restore(cursor, user, selection):
    try:
        payload, signature = cursor.rsplit(".", 1)
        expected = hmac.new(get_settings().app_key.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        state = json.loads(base64.urlsafe_b64decode(payload))
        if state["user"] != user.username or state["selection"] != selection or time.time() - state["issued"] > 3600:
            raise ValueError()
        return state
    except (ValueError, KeyError, TypeError, UnicodeError) as exc:
        raise HTTPException(400, "This search has expired or changed. Start a new search.") from exc


def snippets(text, query):
    results = []
    # Literal matching, not CloudWatch filter syntax or a user-supplied regex.
    start = 0
    lower = text.lower()
    while len(results) < 5:
        found = lower.find(query.lower(), start)
        if found < 0:
            break
        left, right = max(0, found - 100), min(len(text), found + len(query) + 180)
        results.append(text[left:right])
        start = right
    return results


@router.get("/job-log-search")
def search_logs(
    q: str = Query(min_length=2, max_length=200),
    office: list[str] | None = Query(default=None),
    submitted_from: datetime | None = Query(default=None, alias="submittedFrom"),
    submitted_before: datetime | None = Query(default=None, alias="submittedBefore"),
    cursor: str | None = Query(default=None, max_length=32768),
    user: User = Depends(get_current_user),
    job_db: JobDatabase = Depends(get_job_database),
    job_logger: JobLogger = Depends(get_job_logger),
):
    q = q.strip()
    if len(q) < 2:
        raise HTTPException(422, "Enter at least two characters to search")
    offices = sorted(set(office or user.offices))
    if not set(offices).issubset(user.offices):
        raise HTTPException(403, "Office access required")
    for date in (submitted_from, submitted_before):
        if date is not None and date.utcoffset() is None:
            raise HTTPException(422, "Date filters must include a timezone")
    if submitted_from and submitted_before and submitted_from >= submitted_before:
        raise HTTPException(422, "The start date must precede the end date")
    selection = [q, offices, str(submitted_from), str(submitted_before)]
    state = {"user": user.username, "selection": selection, "issued": time.time(),
             "before": (submitted_before or datetime.now(timezone.utc)).isoformat(),
             "offset": 0, "job": None, "logCursor": None}
    if cursor:
        state = restore(cursor, user, selection)
    filters = {"submitted_before": datetime.fromisoformat(state["before"])}
    if submitted_from:
        filters["submitted_from"] = submitted_from
    results = []
    unavailable = 0
    scanned = 0
    complete = False
    # Each request reads at most three bounded log pages. Continuations stay
    # on the same job until its saved output is exhausted.
    for _ in range(3):
        if state["job"]:
            job = job_db.get_job_by_id(UUID(state["job"]))
            if not job or job.office not in offices:
                raise HTTPException(403, "The search selection is no longer accessible. Start a new search.")
        else:
            jobs = job_db.get_jobs_for_offices(offices, limit=1, offset=state["offset"], **filters)
            if not jobs:
                complete = True
                break
            job = jobs[0]
            if job.office not in offices:
                raise HTTPException(403, "Office access required")
        try:
            page = job_logger.get_log_page(job.id, state["logCursor"])
        except FileNotFoundError:
            page = None
        except Exception as exc:
            logger.exception("Job log search could not read output", extra={"job_id": job.id})
            raise HTTPException(503, "Log search is temporarily unavailable. Retry this page.") from exc
        if page and page.available:
            text = page.logs
            found = snippets(text, q)
            if found:
                results.append({"jobId": str(job.id), "name": job.script_name, "office": job.office,
                                "createdTime": job.created_time, "snippets": found})
            if page.has_more and page.next_cursor and page.next_cursor != state["logCursor"]:
                state.update(job=str(job.id), logCursor=page.next_cursor)
                continue
        else:
            unavailable += 1
        scanned += 1
        state.update(offset=state["offset"] + 1, job=None, logCursor=None)
    return {"results": results, "scannedJobs": scanned, "unavailableJobs": unavailable,
            "nextCursor": None if complete else sign(state)}
