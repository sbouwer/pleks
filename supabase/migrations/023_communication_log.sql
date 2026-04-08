-- 023_communication_log.sql
-- Communications foundation: patches communication_log (pre-existing table)
-- and creates communication_preferences.
-- Fully idempotent — safe to re-run.

-- ── ENUMs ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE comm_channel AS ENUM ('email', 'sms', 'whatsapp_future');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_status AS ENUM ('sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── communication_log ─────────────────────────────────────────────────────────
-- Table pre-existed with columns: id, org_id, tenant_id, contact_id, lease_id,
-- channel, direction, subject, body, status, external_id, sent_by, sent_to_email,
-- sent_to_phone, has_attachments, attachment_paths, created_at, entity_type,
-- entity_id, metadata, provider_response, delivered_at, opened_at,
-- failed_reason, triggered_by.
-- We add only the missing columns our comms layer needs.

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS template_key   TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE INDEX IF NOT EXISTS idx_comm_log_org       ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_entity    ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_template  ON communication_log(template_key, org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_provider  ON communication_log(external_id) WHERE external_id IS NOT NULL;

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "comm_log_org_select" ON communication_log
    FOR SELECT USING (
      org_id IN (
        SELECT org_id FROM user_orgs
        WHERE user_id = auth.uid() AND deleted_at IS NULL
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── communication_preferences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_preferences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id),
  contact_id            UUID REFERENCES contacts(id),
  email                 TEXT,
  unsubscribe_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  email_applications    BOOLEAN NOT NULL DEFAULT true,
  email_maintenance     BOOLEAN NOT NULL DEFAULT true,
  email_arrears         BOOLEAN NOT NULL DEFAULT true,
  email_inspections     BOOLEAN NOT NULL DEFAULT true,
  email_lease           BOOLEAN NOT NULL DEFAULT true,
  email_statements      BOOLEAN NOT NULL DEFAULT true,
  sms_maintenance       BOOLEAN NOT NULL DEFAULT true,
  sms_arrears           BOOLEAN NOT NULL DEFAULT true,
  sms_inspections       BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at       TIMESTAMPTZ,
  email_hard_bounced    BOOLEAN NOT NULL DEFAULT false,
  email_hard_bounced_at TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, contact_id),
  UNIQUE(org_id, email)
);

-- Patch in case the table existed but was only partially created
ALTER TABLE communication_preferences
  ADD COLUMN IF NOT EXISTS contact_id            UUID REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS email                 TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribe_token     TEXT DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS email_applications    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_maintenance     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_arrears         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_inspections     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_lease           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_statements      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_maintenance       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_arrears           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_inspections       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_hard_bounced    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_hard_bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT now();

-- Unique constraints (no-op if already present)
DO $$ BEGIN
  ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_token_unique UNIQUE (unsubscribe_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_org_contact UNIQUE (org_id, contact_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_org_email UNIQUE (org_id, email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_comm_prefs_contact ON communication_preferences(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_email   ON communication_preferences(email);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_token   ON communication_preferences(unsubscribe_token);

ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "comm_prefs_org" ON communication_preferences
    FOR ALL USING (
      org_id IN (
        SELECT org_id FROM user_orgs
        WHERE user_id = auth.uid() AND deleted_at IS NULL
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE communication_log         IS 'Immutable log of every outbound email/SMS. Status updated via provider webhooks.';
COMMENT ON TABLE communication_preferences IS 'Per-recipient communication opt-out preferences. Mandatory templates bypass these checks.';
