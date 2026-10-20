ALTER TABLE scripts
    ADD COLUMN configuration_key uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE scripts
    ADD CONSTRAINT scripts_configuration_key_unique UNIQUE (configuration_key);
