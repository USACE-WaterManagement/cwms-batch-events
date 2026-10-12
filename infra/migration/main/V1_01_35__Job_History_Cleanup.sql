INSERT INTO maintenance_tasks(name)
VALUES ('job_history_cleanup')
ON CONFLICT (name) DO NOTHING;
