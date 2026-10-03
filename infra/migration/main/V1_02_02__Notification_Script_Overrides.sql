ALTER TABLE script_notification_rules
    ADD COLUMN IF NOT EXISTS subject_template varchar,
    ADD COLUMN IF NOT EXISTS body_template varchar,
    ADD COLUMN IF NOT EXISTS cda_user_list_id varchar,
    ADD COLUMN IF NOT EXISTS manual_recipients varchar[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS script_notification_rules_one_active_job_failed
    ON script_notification_rules(script_id, event_type)
    WHERE active IS TRUE;
