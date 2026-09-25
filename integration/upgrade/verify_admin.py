"""Real PostgreSQL metrics checks. All synthetic records are rolled back."""
from datetime import timedelta
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import text
from cwms_batch_events.api.routers.admin import operations
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import create_session


def main():
    actor = User(username="hq-report-test", offices=[], admin_offices=[], roles={"HQ": ["CWMS Admin"]})
    with create_session() as db:
        now = db.scalar(text("SELECT CURRENT_TIMESTAMP"))
        runner = db.scalar(text("SELECT id FROM job_runners LIMIT 1"))
        assert runner is not None
        def job(office, status, age_days, start_minutes=None, duration=None):
            created = now-timedelta(days=age_days)
            start = None if start_minutes is None else created+timedelta(minutes=start_minutes)
            end = None if duration is None else start+timedelta(minutes=duration)
            db.execute(text("""INSERT INTO jobs (id,office,script_name,username,repo_path,job_status,
                job_runner_id,created_time,run_time,end_time) VALUES
                (:id,:office,'Admin metrics integration','metrics-test','test.py',:status,:runner,:created,:start,:end)"""),
                dict(id=uuid4(),office=office,status=status,runner=runner,created=created,start=start,end=end))
        job("ZZA", "Completed", 10, 5, 60)
        job("ZZA", "Failed", 1, 5, 30)
        job("ZZA", "Completed", 2)
        job("ZZA", "Failed", 3, 10, -5)
        job("ZZA", "Running", 1, 0)
        job("ZZA", "Pending", 40)
        job("ZZB", "Completed", 1, 5, 120)
        job("ZZA", "Completed", -1, 5, 60)
        result = operations(days=30, office="zza", queue_minutes=15, run_minutes=120, user=actor, db=db)
        assert len(result.usage) == 1
        usage = result.usage[0]
        assert usage.office == "ZZA" and usage.runs == 5 and usage.failed == 2
        assert usage.runtime_minutes == 90 and usage.missing_duration == 2
        assert usage.users == 1 and sum(row.runs for row in result.daily) == 5
        assert result.queued == 1 and result.running == 1 and result.attention_total == 2
        assert result.attention[0].status == "Pending"
        assert all(row.office == "ZZA" for row in result.top_jobs)
        assert len(result.failures) == 2 and all(row.office == "ZZA" for row in result.failures)
        db.rollback()
    print("PASS: HQ usage, office/date filters, durations, missing timestamps, and old queue alerts on PostgreSQL")


if __name__ == "__main__":
    main()
