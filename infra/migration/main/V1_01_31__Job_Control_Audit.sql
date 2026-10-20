CREATE TABLE job_control_audit (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    office VARCHAR(10) NOT NULL,
    requested_by VARCHAR NOT NULL,
    action VARCHAR NOT NULL,
    previous_status VARCHAR NOT NULL,
    resulting_status VARCHAR NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX job_control_audit_job_time_idx
    ON job_control_audit (job_id, created_time DESC);
