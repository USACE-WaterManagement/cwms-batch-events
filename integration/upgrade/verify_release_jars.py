from pathlib import Path
import sys
from uuid import uuid4
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from sqlalchemy import text
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase
from cwms_batch_events.core.job_database.postgres.session import create_session
from cwms_batch_events.core.models import JobMessage, ReleaseJar, ScriptCreate, ScriptRunRequest, ScriptUpdate
from cwms_batch_events.core.maintenance import register_due_jobs


def main():
    actor = User(username='jar-test', offices=['SWT'], admin_offices=['SWT'], roles={'SWT': ['CWMS Users']})
    pin = ReleaseJar(repository='org/repository', release_id=1, asset_id=2, tag='v1', name='job.jar', sha256='a' * 64, size=4)
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    payload = ScriptCreate(office='SWT', name='Release pin ' + uuid4().hex, description='', repo_path='ignored',
        runtime='java', release_jar=pin, command_args=['two words'], schedule_enabled=True, schedule_type='cron',
        schedule_cron=f'{now.minute} * * * *', schedule_timezone='UTC')
    with create_session() as db:
        saved = PostgresJobDatabase(db).store_script(payload, actor)
        assert saved.release_jar == pin
    with create_session() as db:
        job = PostgresJobDatabase(db).create_job(ScriptRunRequest(script_id=saved.id, command_args=['--help']), actor)
        assert job.release_jar == pin and job.command_args == ['--help']
    with create_session() as db, db.begin():
        db.execute(text('UPDATE scripts SET schedule_updated_at=:t WHERE id=:id'), {'t': now-timedelta(minutes=2), 'id': saved.id})
        db.execute(text("UPDATE maintenance_tasks SET last_checked=:t WHERE name='schedules'"), {'t': now-timedelta(minutes=1)})
    register_due_jobs(now)
    with create_session() as db:
        queued = db.execute(text('SELECT payload FROM job_outbox JOIN jobs ON jobs.id=job_outbox.job_id WHERE jobs.script_id=:id'), {'id': saved.id}).scalar_one()
        assert JobMessage.model_validate(queued).payload.release_jar == pin
    newer = pin.model_copy(update={'asset_id': 3, 'tag': 'v2'})
    update = ScriptUpdate(**(payload.model_dump(by_alias=False, exclude={'office'}) | {'release_jar': newer, 'schedule_enabled': False}))
    with create_session() as db:
        assert PostgresJobDatabase(db).update_script(saved.id, update, actor.admin_offices, actor).release_jar == newer
    with create_session() as db:
        assert PostgresJobDatabase(db).get_job_by_id(job.id).release_jar == pin
    print('PASS: release JAR persistence, custom arguments, scheduled queue snapshot, and immutable job pin')


if __name__ == '__main__':
    main()
