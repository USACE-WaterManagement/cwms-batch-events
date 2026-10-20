-- Keep dispatch supervision bounded independently of retained job history.
CREATE INDEX jobs_unlinked_dispatch_time_idx
    ON jobs (coalesce(dispatch_claimed_at, created_time), created_time, id)
    WHERE job_status='Pending' AND external_job_id IS NULL;
CREATE INDEX jobs_unknown_dispatch_office_time_idx
    ON jobs (office, created_time)
    WHERE job_status='Dispatch unknown';
