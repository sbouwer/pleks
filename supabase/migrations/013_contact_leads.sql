-- ─────────────────────────────────────────────────────────────────────────────
-- 013: Contact leads — public marketing-site form submissions
--
-- Captures inbound leads from /contact page. Public form (no auth context),
-- so RLS allows anonymous INSERT but only service-role SELECT/UPDATE.
-- Stéan reads via admin-only page; visitor never reads back.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL,
  phone           text,
  intent          text NOT NULL DEFAULT 'general'
    CHECK (intent IN ('demo', 'founding', 'support', 'general')),
  message         text,
  -- Lightweight context for triage (not PII)
  user_agent      text,
  referrer        text,
  utm_source      text,
  utm_campaign    text,
  -- Lifecycle
  status          text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'demoed', 'closed_won', 'closed_lost', 'spam')),
  contacted_at    timestamptz,
  closed_at       timestamptz,
  notes           text,
  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS update_contact_leads_updated_at ON contact_leads;
CREATE TRIGGER update_contact_leads_updated_at
  BEFORE UPDATE ON contact_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indices
CREATE INDEX IF NOT EXISTS idx_contact_leads_created_at ON contact_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_status     ON contact_leads(status);
CREATE INDEX IF NOT EXISTS idx_contact_leads_intent     ON contact_leads(intent);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Public form posts via service-role server action, so RLS is enabled but no
-- policies are added — only service-role can read/write. The server action
-- (which runs with service-role) is the sole writer. No SELECT policy means
-- no one can read leads via the anon client, which is the intended behaviour.

ALTER TABLE contact_leads ENABLE ROW LEVEL SECURITY;

-- Document the absence of policies for future maintainers
COMMENT ON TABLE contact_leads IS
  'Inbound leads from the public /contact page. No RLS policies — service-role only, '
  'written by the submitContactForm server action and read by admin-only UI.';
