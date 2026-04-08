-- 023_communication_log.sql
-- Shared communication infrastructure: every outbound email/SMS logged here.
-- Used by all modules: applications, arrears, maintenance, inspections, leases, deposits, statements.

-- ── communication_log ────────────────────────────────────────────────────────
-- Immutable append-only log. Status updates come via provider webhooks (service role only).

CREATE TYPE comm_channel AS ENUM ('email', 'sms', 'whatsapp_future');
CREATE TYPE comm_status  AS ENUM ('sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed');

CREATE TABLE communication_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organisations(id),
  channel              comm_channel NOT NULL,

  -- Recipient
  recipient_contact_id UUID REFERENCES contacts(id),       -- null for applicants not yet in contacts
  recipient_email      TEXT,                                -- denormalised (email channel)
  recipient_phone      TEXT,                                -- denormalised (SMS channel)
  recipient_name       TEXT,                                -- name at time of send

  -- Message
  template_key         TEXT NOT NULL,                       -- e.g. 'application.received'
  subject              TEXT,                                -- email only
  body_preview         TEXT,                                -- first 200 chars (never full body)

  -- Context
  entity_type          TEXT,                                -- 'application' | 'lease' | 'maintenance_request' | 'inspection' | 'arrears_case'
  entity_id            UUID,
  metadata             JSONB DEFAULT '{}',                  -- template variables snapshot

  -- Delivery
  status               comm_status NOT NULL DEFAULT 'sent',
  provider_id          TEXT,                                -- Resend message ID or Africa's Talking SMS ID
  provider_response    JSONB,                               -- raw webhook payload
  sent_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at         TIMESTAMPTZ,
  opened_at            TIMESTAMPTZ,
  failed_reason        TEXT,

  -- Audit
  triggered_by         UUID REFERENCES auth.users(id),      -- null = system / cron
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comm_log_org      ON communication_log(org_id);
CREATE INDEX idx_comm_log_entity   ON communication_log(entity_type, entity_id);
CREATE INDEX idx_comm_log_recipient ON communication_log(recipient_contact_id);
CREATE INDEX idx_comm_log_template ON communication_log(template_key, org_id);
CREATE INDEX idx_comm_log_sent     ON communication_log(sent_at DESC);
CREATE INDEX idx_comm_log_provider ON communication_log(provider_id) WHERE provider_id IS NOT NULL;

-- Org members can read their org's log; INSERT/UPDATE via service role only (no RLS INSERT policy)
ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comm_log_org_select" ON communication_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ── communication_preferences ────────────────────────────────────────────────
-- Per-recipient opt-out tracking. Mandatory templates (letter of demand, CPA s14,
-- deposit return, inspection dispute) cannot be suppressed.

CREATE TABLE communication_preferences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id),
  contact_id            UUID REFERENCES contacts(id),        -- null for applicants
  email                 TEXT,                                 -- for non-contact recipients
  unsubscribe_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- Per-category opt-out (default: all enabled)
  email_applications    BOOLEAN NOT NULL DEFAULT true,
  email_maintenance     BOOLEAN NOT NULL DEFAULT true,
  email_arrears         BOOLEAN NOT NULL DEFAULT true,
  email_inspections     BOOLEAN NOT NULL DEFAULT true,
  email_lease           BOOLEAN NOT NULL DEFAULT true,
  email_statements      BOOLEAN NOT NULL DEFAULT true,
  sms_maintenance       BOOLEAN NOT NULL DEFAULT true,
  sms_arrears           BOOLEAN NOT NULL DEFAULT true,
  sms_inspections       BOOLEAN NOT NULL DEFAULT true,

  -- Full opt-out
  unsubscribed_at       TIMESTAMPTZ,

  -- Bounce suppression (Resend webhook updates this)
  email_hard_bounced    BOOLEAN NOT NULL DEFAULT false,
  email_hard_bounced_at TIMESTAMPTZ,

  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, contact_id),
  UNIQUE(org_id, email)
);

CREATE INDEX idx_comm_prefs_contact ON communication_preferences(contact_id);
CREATE INDEX idx_comm_prefs_email   ON communication_preferences(email);
CREATE INDEX idx_comm_prefs_token   ON communication_preferences(unsubscribe_token);

ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY;
-- Org members can read/update preferences for their org's contacts
CREATE POLICY "comm_prefs_org" ON communication_preferences
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

COMMENT ON TABLE communication_log         IS 'Immutable log of every outbound email/SMS. Status updated via provider webhooks.';
COMMENT ON TABLE communication_preferences IS 'Per-recipient communication opt-out preferences. Mandatory templates bypass these checks.';
