-- Optional per-office API request limits. Missing rows use application defaults.
CREATE TABLE office_rate_limits (
    office VARCHAR(10) PRIMARY KEY CHECK (office ~ '^[A-Z0-9-]{2,10}$'),
    requests_per_minute INTEGER NOT NULL CHECK (requests_per_minute BETWEEN 1 AND 10000),
    job_submissions_per_minute INTEGER NOT NULL CHECK (job_submissions_per_minute BETWEEN 1 AND 1000),
    updated_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
