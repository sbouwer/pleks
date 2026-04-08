-- 025_comm_log_full_patch.sql
-- Adds ALL columns that may be missing from communication_log and communication_preferences.
-- Safe to run multiple times — every statement uses IF NOT EXISTS or equivalent.

-- ── communication_log columns ─────────────────────────────────────────────────

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS recipient_contact_id UUID REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS recipient_email      TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone      TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name       TEXT,
  ADD COLUMN IF NOT EXISTS subject              TEXT,
  ADD COLUMN IF NOT EXISTS body_preview         TEXT,
  ADD COLUMN IF NOT EXISTS entity_type          TEXT,
  ADD COLUMN IF NOT EXISTS entity_id            UUID,
  ADD COLUMN IF NOT EXISTS metadata             JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider_id          TEXT,
  ADD COLUMN IF NOT EXISTS provider_response    JSONB,
  ADD COLUMN IF NOT EXISTS delivered_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_reason        TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by         UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_comm_log_org       ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_entity    ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(recipient_contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_template  ON communication_log(template_key, org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_sent      ON communication_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_log_provider  ON communication_log(provider_id) WHERE provider_id IS NOT NULL;

-- ── communication_preferences columns ─────────────────────────────────────────

ALTER TABLE communication_preferences
  ADD COLUMN IF NOT EXISTS contact_id           UUID REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS email                TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribe_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS email_applications   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_maintenance    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_arrears        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_inspections    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_lease          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_statements     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_maintenance      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_arrears          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_inspections      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_hard_bounced   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_hard_bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_comm_prefs_contact ON communication_preferences(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_email   ON communication_preferences(email);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_token   ON communication_preferences(unsubscribe_token);
