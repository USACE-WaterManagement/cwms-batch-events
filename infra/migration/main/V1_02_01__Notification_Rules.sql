CREATE TABLE IF NOT EXISTS notification_templates(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    office varchar NOT NULL,
    slug varchar NOT NULL,
    subject_template varchar NOT NULL,
    body_template varchar NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_time timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_templates_office_slug UNIQUE(office, slug)
);

CREATE TABLE IF NOT EXISTS script_notification_rules(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id uuid NOT NULL,
    event_type varchar NOT NULL CHECK (event_type = 'job_failed'),
    template_id uuid NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_time timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT script_notification_rules_unique_rule UNIQUE(script_id, event_type, template_id),
    CONSTRAINT fk_script_notification_rules_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
    CONSTRAINT fk_script_notification_rules_template FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE CASCADE
);
