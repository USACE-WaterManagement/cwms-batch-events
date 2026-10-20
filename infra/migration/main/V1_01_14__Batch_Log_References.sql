ALTER TABLE jobs
    ADD COLUMN log_group VARCHAR,
    ADD COLUMN log_stream VARCHAR,
    ADD COLUMN batch_status VARCHAR,
    ADD COLUMN batch_status_reason VARCHAR,
    ADD COLUMN batch_details_time TIMESTAMPTZ,
    ADD COLUMN batch_checked_at TIMESTAMPTZ;
