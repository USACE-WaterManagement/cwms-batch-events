-- Keep an append-only history of office rate-limit changes.
CREATE TABLE office_rate_limit_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    office VARCHAR(4) NOT NULL CHECK (office ~ '^[A-Z]{3,4}$'),
    action VARCHAR(16) NOT NULL CHECK (action IN ('created', 'updated', 'reset', 'legacy')),
    previous_requests_per_minute INTEGER,
    previous_job_submissions_per_minute INTEGER,
    new_requests_per_minute INTEGER,
    new_job_submissions_per_minute INTEGER,
    changed_by VARCHAR(320) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX office_rate_limit_history_office_changed_at_idx
    ON office_rate_limit_history (office, changed_at DESC, id DESC);

-- Preserve a starting point for overrides that existed before history was added.
INSERT INTO office_rate_limit_history (
    office, action, new_requests_per_minute, new_job_submissions_per_minute,
    changed_by, changed_at
)
SELECT office, 'legacy', requests_per_minute, job_submissions_per_minute,
       changed_by, changed_at
FROM office_rate_limits;
