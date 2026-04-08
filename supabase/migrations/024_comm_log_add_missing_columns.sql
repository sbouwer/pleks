-- 024_comm_log_add_missing_columns.sql
-- Adds columns that were missing from the initial communication_log creation
-- (table existed before 023 ran fully, so IF NOT EXISTS skipped re-creation).

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS entity_type    TEXT,
  ADD COLUMN IF NOT EXISTS entity_id      UUID,
  ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider_response JSONB,
  ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_reason  TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by   UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_comm_log_entity ON communication_log(entity_type, entity_id);
