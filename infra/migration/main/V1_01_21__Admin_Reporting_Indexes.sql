-- Bound organization reports by submission time and keep active-job monitoring
-- independent of the size of completed history.
CREATE INDEX jobs_created_time_idx ON jobs (created_time DESC);
CREATE INDEX jobs_active_office_time_idx ON jobs (office, created_time, run_time)
    WHERE job_status IN ('Pending', 'Running');
