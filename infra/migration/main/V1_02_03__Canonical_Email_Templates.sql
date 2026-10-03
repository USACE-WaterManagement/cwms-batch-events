-- Preserve effective per-script content by promoting every override to a
-- dedicated canonical template before removing the override columns.
CREATE TEMP TABLE migrated_notification_rule_templates ON COMMIT DROP AS
SELECT
    rule.id AS rule_id,
    gen_random_uuid() AS template_id,
    template.office,
    left(script.slug, 100)
        || '-job-failure-'
        || left(replace(rule.id::text, '-', ''), 12) AS slug,
    coalesce(rule.subject_template, template.subject_template) AS subject_template,
    coalesce(rule.body_template, template.body_template) AS body_template,
    template.active
FROM script_notification_rules rule
JOIN notification_templates template ON template.id = rule.template_id
JOIN scripts script ON script.id = rule.script_id
WHERE rule.subject_template IS NOT NULL
   OR rule.body_template IS NOT NULL;

INSERT INTO notification_templates(
    id,
    office,
    slug,
    subject_template,
    body_template,
    active
)
SELECT
    template_id,
    office,
    slug,
    subject_template,
    body_template,
    active
FROM migrated_notification_rule_templates;

UPDATE script_notification_rules rule
SET template_id = migrated.template_id
FROM migrated_notification_rule_templates migrated
WHERE migrated.rule_id = rule.id;

-- An unavailable template previously suppressed its active rules. Preserve
-- that behavior by disabling those rules before removing the global control.
UPDATE script_notification_rules rule
SET active = false,
    updated_time = CURRENT_TIMESTAMP
FROM notification_templates template
WHERE template.id = rule.template_id
  AND template.active IS FALSE
  AND rule.active IS TRUE;

ALTER TABLE script_notification_rules
    DROP COLUMN IF EXISTS subject_template,
    DROP COLUMN IF EXISTS body_template;

ALTER TABLE notification_templates
    DROP COLUMN IF EXISTS active;

ALTER TABLE script_notification_rules
    DROP CONSTRAINT IF EXISTS fk_script_notification_rules_template,
    ADD CONSTRAINT fk_script_notification_rules_template
        FOREIGN KEY (template_id)
        REFERENCES notification_templates(id)
        ON DELETE RESTRICT;
