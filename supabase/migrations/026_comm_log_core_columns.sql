-- 026_comm_log_core_columns.sql
-- Adds columns missing from the pre-existing communication_log table.
-- Existing table uses: contact_id, sent_to_email, external_id, body, created_at.
-- We only need to add: template_key, recipient_name.
-- All indexes use IF NOT EXISTS — safe to re-run.

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS template_key   TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE INDEX IF NOT EXISTS idx_comm_log_org       ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_entity    ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_template  ON communication_log(template_key, org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_provider  ON communication_log(external_id) WHERE external_id IS NOT NULL;
