ALTER TABLE scripts ADD COLUMN schedule_updated_by VARCHAR;
ALTER TABLE scripts ADD COLUMN schedule_updated_name VARCHAR;
ALTER TABLE scripts ADD COLUMN schedule_updated_at TIMESTAMPTZ;
ALTER TABLE scripts ADD COLUMN schedule_error VARCHAR;
CREATE INDEX scripts_enabled_schedule ON scripts(id) WHERE active AND schedule_enabled;
ALTER TABLE jobs ADD COLUMN scheduled_for TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN schedule_timezone VARCHAR;
ALTER TABLE jobs ADD COLUMN schedule_author VARCHAR;
ALTER TABLE jobs ADD COLUMN dispatch_claimed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX jobs_scheduled_occurrence ON jobs(script_id, scheduled_for)
    WHERE scheduled_for IS NOT NULL;

CREATE TABLE maintenance_tasks (
    name VARCHAR PRIMARY KEY,
    last_success TIMESTAMPTZ,
    last_checked TIMESTAMPTZ
);
INSERT INTO maintenance_tasks(name) VALUES ('schedules'), ('queue_delivery');

CREATE TABLE job_outbox (
    job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ
);
CREATE INDEX job_outbox_pending ON job_outbox(next_attempt) WHERE sent_at IS NULL;
