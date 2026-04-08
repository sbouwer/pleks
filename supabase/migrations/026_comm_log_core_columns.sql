-- 026_comm_log_core_columns.sql
-- Adds core columns missing from the partially-created communication_log table.
-- Must run before 025 indexes (which reference these columns).

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS template_key  TEXT,
  ADD COLUMN IF NOT EXISTS channel       TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- Now safe to create the indexes from 025
CREATE INDEX IF NOT EXISTS idx_comm_log_org       ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_entity    ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(recipient_contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_template  ON communication_log(template_key, org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_sent      ON communication_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_log_provider  ON communication_log(provider_id) WHERE provider_id IS NOT NULL;
