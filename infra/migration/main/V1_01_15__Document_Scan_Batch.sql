-- The SWT pilot now uses the existing district Batch job definition.
ALTER TABLE document_scans ADD COLUMN external_job_id TEXT;
ALTER TABLE document_scans ADD COLUMN storage_cleaned BOOLEAN NOT NULL DEFAULT FALSE;
