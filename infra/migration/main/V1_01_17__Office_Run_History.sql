ALTER TABLE jobs ADD COLUMN display_name VARCHAR;
ALTER TABLE jobs ADD COLUMN run_trigger VARCHAR NOT NULL DEFAULT 'unknown'
    CHECK (run_trigger IN ('manual', 'scheduled', 'unknown'));

CREATE INDEX jobs_office_created_id_idx ON jobs (office, created_time DESC, id DESC);
