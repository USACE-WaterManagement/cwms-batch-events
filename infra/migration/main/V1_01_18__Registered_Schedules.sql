ALTER TABLE scripts ADD COLUMN schedule_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE scripts ADD COLUMN schedule_type text NOT NULL DEFAULT 'manual'
    CHECK (schedule_type IN ('manual', 'hourly', 'cron'));
ALTER TABLE scripts ADD COLUMN schedule_minute integer
    CHECK (schedule_minute BETWEEN 0 AND 59);
ALTER TABLE scripts ADD COLUMN schedule_cron text;
ALTER TABLE scripts ADD COLUMN schedule_timezone text NOT NULL DEFAULT 'UTC'
    CHECK (length(trim(schedule_timezone)) > 0);
ALTER TABLE scripts ADD CONSTRAINT enabled_schedule_shape CHECK (
    NOT schedule_enabled OR
    (schedule_type = 'hourly' AND schedule_minute IS NOT NULL) OR
    (schedule_type = 'cron' AND schedule_cron IS NOT NULL AND length(trim(schedule_cron)) > 0)
);
