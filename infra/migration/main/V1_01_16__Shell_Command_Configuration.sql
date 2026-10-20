-- Existing records retain their version and literal argument behavior.
ALTER TABLE scripts ADD COLUMN command_mode VARCHAR NOT NULL DEFAULT 'arguments';
ALTER TABLE scripts ADD COLUMN shell_command VARCHAR;
ALTER TABLE jobs ADD COLUMN command_mode VARCHAR NOT NULL DEFAULT 'arguments';
ALTER TABLE jobs ADD COLUMN shell_command VARCHAR;
