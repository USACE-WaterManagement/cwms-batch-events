ALTER TABLE scripts
    ADD COLUMN environment_variables JSONB NOT NULL DEFAULT '[]';

ALTER TABLE jobs
    ADD COLUMN environment_variables JSONB NOT NULL DEFAULT '[]';
