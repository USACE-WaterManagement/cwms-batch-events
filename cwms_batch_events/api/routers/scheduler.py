from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import create_session
from cwms_batch_events.core.models import CamelModel
from cwms_batch_events.core.settings import get_settings

router = APIRouter(tags=["scheduler"])


class TaskHealth(CamelModel):
    name: str
    last_success: datetime | None
    healthy: bool


class SchedulerStatus(CamelModel):
    enabled: bool
    tasks: list[TaskHealth]
    pending_delivery: int
    needs_attention: int
    invalid_schedules: int


@router.get("/scheduler/status", response_model=SchedulerStatus)
def scheduler_status(office: str, user: User = Depends(get_current_user)):
    office = office.upper()
    if office not in user.offices:
        raise HTTPException(404, "Office not found")
    with create_session() as db:
        now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
        tasks = [TaskHealth(name=row.name, last_success=row.last_success,
            healthy=bool(row.last_success and now - row.last_success < timedelta(minutes=2)))
            for row in db.execute(text("SELECT name, last_success FROM maintenance_tasks ORDER BY name"))]
        pending = db.scalar(text("""SELECT count(*) FROM job_outbox o JOIN jobs j ON j.id=o.job_id
            WHERE j.office=:office AND o.sent_at IS NULL"""), {"office": office})
        attention = db.scalar(text("""SELECT count(*) FROM jobs
            WHERE office=:office AND scheduled_for IS NOT NULL AND job_status='Pending'
              AND created_time < :cutoff"""), {"office": office, "cutoff": now - timedelta(minutes=10)})
        invalid = db.scalar(text("SELECT count(*) FROM scripts WHERE office=:office AND schedule_enabled AND schedule_error IS NOT NULL"), {"office": office})
        return SchedulerStatus(enabled=get_settings().scheduler_enabled, tasks=tasks,
                               pending_delivery=pending, needs_attention=attention, invalid_schedules=invalid)
