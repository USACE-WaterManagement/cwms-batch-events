-- Unversioned registrations and submitted jobs belong to the legacy schema.
-- API creation and explicit edits supply version 2; reads/runs never upgrade rows.
ALTER TABLE scripts ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
