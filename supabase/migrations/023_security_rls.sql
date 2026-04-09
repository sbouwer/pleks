-- ═══════════════════════════════════════════════════════════════
-- Migration 023: Enable RLS on tables missing Row Level Security
-- ═══════════════════════════════════════════════════════════════
-- Idempotent: policies are dropped before recreation

-- ── 1. waitlist ──────────────────────────────────────────────────────────────
-- Public email capture. Anyone can INSERT (opt-in form). No public SELECT —
-- reads happen via service role only.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waitlist_public_insert" ON waitlist;
CREATE POLICY "waitlist_public_insert" ON waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ── 2. lease_clause_library ──────────────────────────────────────────────────
-- System-managed clause templates, no org_id. Authenticated users can read;
-- no public writes (managed via migrations/seed only).
ALTER TABLE lease_clause_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clause_library_authenticated_read" ON lease_clause_library;
CREATE POLICY "clause_library_authenticated_read" ON lease_clause_library
  FOR SELECT TO authenticated
  USING (true);

-- ── 3. prime_rates ───────────────────────────────────────────────────────────
-- SARB repo/prime reference data, no org_id. Authenticated users can read;
-- no public writes (updated via migrations or admin service role).
ALTER TABLE prime_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prime_rates_authenticated_read" ON prime_rates;
CREATE POLICY "prime_rates_authenticated_read" ON prime_rates
  FOR SELECT TO authenticated
  USING (true);

-- ── 4. rule_templates ────────────────────────────────────────────────────────
-- System arrears-rule templates, no org_id. Authenticated users can read;
-- no public writes.
ALTER TABLE rule_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rule_templates_authenticated_read" ON rule_templates;
CREATE POLICY "rule_templates_authenticated_read" ON rule_templates
  FOR SELECT TO authenticated
  USING (true);

-- ── 5. ai_credit_purchases ───────────────────────────────────────────────────
-- Org-scoped AI credit purchase records. Users can only read their own org's
-- purchases. Writes happen via service role only (payment webhook).
ALTER TABLE ai_credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_credit_purchases_org_read" ON ai_credit_purchases;
CREATE POLICY "ai_credit_purchases_org_read" ON ai_credit_purchases
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ── 6. deposit_interest_config_audit ─────────────────────────────────────────
-- Org-scoped audit trail for deposit interest config changes. Users can read
-- their org's audit entries; writes happen via service role only.
ALTER TABLE deposit_interest_config_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposit_audit_org_read" ON deposit_interest_config_audit;
CREATE POLICY "deposit_audit_org_read" ON deposit_interest_config_audit
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
