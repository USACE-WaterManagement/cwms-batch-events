ALTER TABLE script_notification_rules
    ADD COLUMN IF NOT EXISTS cda_user_list_office varchar;

UPDATE script_notification_rules rule
SET cda_user_list_office = script.office
FROM scripts script
WHERE rule.script_id = script.id
  AND rule.cda_user_list_id IS NOT NULL
  AND rule.cda_user_list_office IS NULL;

ALTER TABLE script_notification_rules
    DROP CONSTRAINT IF EXISTS script_notification_rules_complete_user_list,
    ADD CONSTRAINT script_notification_rules_complete_user_list CHECK (
        (cda_user_list_id IS NULL AND cda_user_list_office IS NULL)
        OR
        (cda_user_list_id IS NOT NULL AND cda_user_list_office IS NOT NULL)
    );
