-- ADDENDUM_48A §9: Org-level notification settings
-- Stored as JSONB on organisations so the settings page can read/write
-- a single row. Individual contact opt-outs remain in communication_preferences.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT '{
    "email_from_name": null,
    "reply_to_email": null,
    "email_applications": true,
    "email_maintenance": true,
    "email_arrears": true,
    "email_inspections": true,
    "email_lease": true,
    "email_statements": true,
    "sms_enabled": false,
    "sms_maintenance": true,
    "sms_arrears": false,
    "sms_inspections": true
  }'::jsonb;

COMMENT ON COLUMN organisations.notification_settings IS
  'Org-level defaults for which email/SMS categories are enabled. '
  'Per-contact opt-outs are in communication_preferences.';
