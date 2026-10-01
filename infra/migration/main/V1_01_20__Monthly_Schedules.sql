ALTER TABLE scripts DROP CONSTRAINT scripts_schedule_type_check;
ALTER TABLE scripts ADD CONSTRAINT scripts_schedule_type_check
    CHECK (schedule_type IN ('manual', 'hourly', 'monthly', 'cron'));
ALTER TABLE scripts DROP CONSTRAINT enabled_schedule_shape;
ALTER TABLE scripts ADD CONSTRAINT enabled_schedule_shape CHECK (
    NOT schedule_enabled OR
    (schedule_type = 'hourly' AND schedule_minute IS NOT NULL) OR
    (schedule_type IN ('cron', 'monthly') AND schedule_cron IS NOT NULL AND length(trim(schedule_cron)) > 0)
);
