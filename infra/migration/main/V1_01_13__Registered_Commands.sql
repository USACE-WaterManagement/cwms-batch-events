-- Extracted from the runtime feature; earlier reserved versions remain with M2M.
ALTER TABLE scripts DROP CONSTRAINT scripts_execution_type_check;
ALTER TABLE jobs DROP CONSTRAINT jobs_execution_type_check;
ALTER TABLE scripts ADD COLUMN runtime text NOT NULL DEFAULT 'python'
    CHECK (runtime IN ('python', 'java', 'shell'));
ALTER TABLE scripts ADD COLUMN command_args text[] NOT NULL DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN runtime text NOT NULL DEFAULT 'python';
ALTER TABLE jobs ADD COLUMN command_args text[] NOT NULL DEFAULT '{}';

-- Keep historical Python rows readable by both API versions during rollout.
ALTER TABLE scripts ADD CONSTRAINT scripts_execution_source_check
    CHECK (execution_type IN ('python', 'github_file', 'command'));
ALTER TABLE jobs ALTER COLUMN execution_type SET DEFAULT 'github_file';
ALTER TABLE jobs ADD CONSTRAINT jobs_execution_source_check
    CHECK (execution_type IN ('python', 'github_file', 'command'));
