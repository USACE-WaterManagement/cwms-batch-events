ALTER TABLE scripts
    ADD COLUMN resource_size VARCHAR NOT NULL DEFAULT 'medium'
    CHECK (resource_size IN ('small', 'medium', 'large'));

ALTER TABLE jobs
    ADD COLUMN resource_size VARCHAR NOT NULL DEFAULT 'medium'
    CHECK (resource_size IN ('small', 'medium', 'large'));
