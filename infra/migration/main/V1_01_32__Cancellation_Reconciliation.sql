ALTER TABLE jobs ADD COLUMN cancellation_requested_at TIMESTAMPTZ;

CREATE INDEX jobs_cancellation_requested_idx
    ON jobs (cancellation_requested_at)
    WHERE job_status = 'Cancelling';

INSERT INTO maintenance_tasks(name)
VALUES ('cancellation_reconciliation')
ON CONFLICT (name) DO NOTHING;
