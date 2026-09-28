-- Record server-derived audit metadata for every persisted office override.
ALTER TABLE office_rate_limits
    ADD COLUMN changed_by VARCHAR(320),
    ADD COLUMN changed_at TIMESTAMPTZ;

-- Existing rows predate audit attribution. Preserve their setup timestamp and
-- make the unknown actor explicit rather than presenting a fabricated user.
UPDATE office_rate_limits
SET changed_by = 'Unknown (pre-audit)',
    changed_at = updated_time
WHERE changed_by IS NULL OR changed_at IS NULL;

ALTER TABLE office_rate_limits
    ALTER COLUMN changed_by SET NOT NULL,
    ALTER COLUMN changed_at SET NOT NULL;
