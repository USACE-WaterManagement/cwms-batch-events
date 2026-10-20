-- The scheduler now requires at least 15 minutes between occurrences.
-- Normalize existing cron registrations before the API starts enforcing it.
CREATE OR REPLACE FUNCTION cron_field_matches(field text, value integer, minimum integer, maximum integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    item text;
    parts text[];
    bounds text[];
    start_value integer;
    end_value integer;
    step_value integer;
BEGIN
    FOREACH item IN ARRAY string_to_array(field, ',') LOOP
        parts := string_to_array(item, '/');
        step_value := COALESCE(NULLIF(parts[2], ''), '1')::integer;
        bounds := string_to_array(parts[1], '-');
        IF parts[1] = '*' THEN
            start_value := minimum;
            end_value := maximum;
        ELSIF cardinality(bounds) = 2 THEN
            start_value := bounds[1]::integer;
            end_value := bounds[2]::integer;
        ELSE
            start_value := bounds[1]::integer;
            end_value := start_value;
        END IF;
        IF value BETWEEN start_value AND end_value
           AND (value - start_value) % step_value = 0 THEN
            RETURN true;
        END IF;
    END LOOP;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION cron_interval_below(expression text, required_minutes integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    fields text[] := regexp_split_to_array(trim(expression), '\\s+');
    slots integer[] := ARRAY[]::integer[];
    hour integer;
    minute integer;
    index integer;
    next_slot integer;
BEGIN
    IF cardinality(fields) <> 5 THEN
        RETURN false;
    END IF;
    FOR hour IN 0..23 LOOP
        IF cron_field_matches(fields[2], hour, 0, 23) THEN
            FOR minute IN 0..59 LOOP
                IF cron_field_matches(fields[1], minute, 0, 59) THEN
                    slots := array_append(slots, hour * 60 + minute);
                END IF;
            END LOOP;
        END IF;
    END LOOP;
    IF cardinality(slots) < 2 THEN
        RETURN false;
    END IF;
    FOR index IN 1..cardinality(slots) LOOP
        next_slot := CASE
            WHEN index = cardinality(slots) THEN slots[1] + 1440
            ELSE slots[index + 1]
        END;
        IF next_slot - slots[index] < required_minutes THEN
            RETURN true;
        END IF;
    END LOOP;
    RETURN false;
END;
$$;

UPDATE scripts
SET schedule_cron = '*/15 ' || regexp_replace(trim(schedule_cron), '^\S+\s+', ''),
    schedule_error = NULL,
    schedule_updated_at = CASE WHEN schedule_enabled THEN now() ELSE schedule_updated_at END
WHERE schedule_type = 'cron'
  AND schedule_cron IS NOT NULL
  AND cron_interval_below(schedule_cron, 15);

DROP FUNCTION cron_interval_below(text, integer);
DROP FUNCTION cron_field_matches(text, integer, integer, integer);
