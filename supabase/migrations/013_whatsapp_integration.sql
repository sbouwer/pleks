-- ═══════════════════════════════════════════════════════════════════════════════
-- 013_whatsapp_integration.sql
-- BUILD_58 — WhatsApp Business API integration
-- Creates: whatsapp_messages, tenant_messaging_consent,
--          whatsapp_cs_windows, messaging_usage
-- Amends:  document_templates (Meta approval columns)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. whatsapp_messages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  lease_id              uuid REFERENCES leases(id),
  tenant_id             uuid REFERENCES tenants(id),
  direction             text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  template_id           uuid REFERENCES document_templates(id),
  tone_variant          text CHECK (tone_variant IN ('friendly', 'professional', 'firm')),
  phone_number          text NOT NULL,
  message_body          text NOT NULL,
  merge_context         jsonb,
  provider              text NOT NULL DEFAULT 'africastalking',
  provider_message_id   text,
  meta_template_name    text,
  status                text NOT NULL CHECK (status IN ('submitted','sent','delivered','read','failed')),
  failure_reason        text,
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  sent_at               timestamptz,
  delivered_at          timestamptz,
  read_at               timestamptz,
  failed_at             timestamptz,
  sms_fallback_sent_at  timestamptz,
  sent_within_cs_window boolean NOT NULL DEFAULT false,
  cost_cents            int,
  communication_log_id  uuid REFERENCES communication_log(id)
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_org ON whatsapp_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_lease ON whatsapp_messages(lease_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_wa_messages_provider_id ON whatsapp_messages(provider_message_id);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_messages_select" ON whatsapp_messages
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

CREATE POLICY "wa_messages_insert" ON whatsapp_messages
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

-- ── 2. tenant_messaging_consent ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_messaging_consent (
  tenant_id             uuid PRIMARY KEY REFERENCES tenants(id),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  email_enabled         boolean NOT NULL DEFAULT true,
  whatsapp_enabled      boolean NOT NULL DEFAULT false,
  sms_enabled           boolean NOT NULL DEFAULT false,
  consent_captured_at   timestamptz,
  consent_captured_by   text,
  consent_captured_ip   inet,
  last_updated          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_messaging_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_select" ON tenant_messaging_consent
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

CREATE POLICY "consent_all_admins" ON tenant_messaging_consent
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND is_admin = true)
  );

-- ── 3. whatsapp_cs_windows (24-hour customer service windows) ─────────────────
CREATE TABLE IF NOT EXISTS whatsapp_cs_windows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id            uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  trigger_message_id  uuid REFERENCES whatsapp_messages(id),
  is_active           boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_cs_windows_lease ON whatsapp_cs_windows(lease_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cs_windows_expires ON whatsapp_cs_windows(expires_at);

ALTER TABLE whatsapp_cs_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_windows_select" ON whatsapp_cs_windows
  FOR SELECT USING (
    lease_id IN (
      SELECT id FROM leases WHERE org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
    )
  );

-- ── 4. messaging_usage (monthly quota and overage tracking) ───────────────────
CREATE TABLE IF NOT EXISTS messaging_usage (
  org_id              uuid NOT NULL REFERENCES organisations(id),
  period              date NOT NULL,
  whatsapp_count      int NOT NULL DEFAULT 0,
  sms_count           int NOT NULL DEFAULT 0,
  email_count         int NOT NULL DEFAULT 0,
  quota_whatsapp      int NOT NULL DEFAULT 400,
  quota_email         int NOT NULL DEFAULT 5000,
  overage_whatsapp    int NOT NULL DEFAULT 0,
  overage_email       int NOT NULL DEFAULT 0,
  overage_cents       int NOT NULL DEFAULT 0,
  last_updated        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period)
);

ALTER TABLE messaging_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_select" ON messaging_usage
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

-- ── 5. Extend document_templates with Meta approval columns ───────────────────
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS whatsapp_meta_variable_map     jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_meta_category         text
    CHECK (whatsapp_meta_category IN ('utility','marketing','authentication')),
  ADD COLUMN IF NOT EXISTS whatsapp_meta_submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_meta_approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_meta_rejection_reason text;
