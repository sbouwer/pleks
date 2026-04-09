-- ═══════════════════════════════════════════════════════════════
-- Migration 009: Security hardening
-- ═══════════════════════════════════════════════════════════════
-- Covers three areas:
--   Part A — Enable RLS on tables that were missing it
--   Part B — Add WITH CHECK to all existing RLS write policies
--   Part C — Cross-org audit helper function
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- PART A: Enable RLS on tables missing Row Level Security
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


-- ═══════════════════════════════════════════════════════════════
-- PART B: Add WITH CHECK to all RLS write policies
-- ═══════════════════════════════════════════════════════════════
-- Generated from live get_rls_audit() output — 82 policies.
-- WITH CHECK matches USING clause on each policy, preventing
-- authenticated users from writing rows into another org's data
-- even if they construct a valid JWT.
--
-- Safe to run: ALTER POLICY is non-destructive and transactional.
-- Reads are unaffected (USING clause unchanged).

-- ─── Standard org-scoped tables (73) ─────────────────────────
-- Pattern: org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)

ALTER POLICY "org_agm"                    ON agm_records                  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_agm_resolutions"        ON agm_resolutions              WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_additional_docs"        ON application_additional_docs  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_co_applicants"          ON application_co_applicants    WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_guarantors"             ON application_guarantors       WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_applications"           ON applications                 WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_arrears"                ON arrears_cases                WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_interest_charges_waive" ON arrears_interest_charges     WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_arrears_steps"          ON arrears_sequence_steps       WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_arrears_sequences"      ON arrears_sequences            WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_bank_imports"           ON bank_statement_imports       WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_stmt_lines"             ON bank_statement_lines         WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_buildings"              ON buildings                    WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "comm_prefs_org"             ON communication_preferences    WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contact_addresses"      ON contact_addresses            WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contact_emails"         ON contact_emails               WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contact_employment"     ON contact_employment           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contact_phones"         ON contact_phones               WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contact_roles"          ON contact_roles                WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contacts"               ON contacts                     WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contractor_contacts"    ON contractor_contacts          WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contractor_prefs"       ON contractor_preferences       WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_contractors"            ON contractors                  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_custom_lease_requests"  ON custom_lease_requests        WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_collections"            ON debicheck_collections        WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_mandates"               ON debicheck_mandates           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_deduction_items"        ON deposit_deduction_items      WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_deposit_recons"         ON deposit_reconciliations      WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_deposit_timers"         ON deposit_timers               WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_hoa"                    ON hoa_entities                 WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_hoa_owners"             ON hoa_unit_owners              WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_import_sessions"        ON import_sessions              WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_inspection_items"       ON inspection_items             WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_inspection_rooms"       ON inspection_rooms             WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_inspections"            ON inspections                  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_landlords"              ON landlords                    WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_lease_amendments"       ON lease_amendments             WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_lease_charges"          ON lease_charges                WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_lease_selections"       ON lease_clause_selections      WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_lease_co_tenants"       ON lease_co_tenants             WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_renewal_offers"         ON lease_renewal_offers         WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_leases"                 ON leases                       WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_levy_invoices"          ON levy_invoices                WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_levy_schedules"         ON levy_schedules               WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_levy_unit_amounts"      ON levy_unit_amounts            WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_listings"               ON listings                     WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_isolation"              ON maintenance_cost_allocations  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_maintenance_photos"     ON maintenance_photos           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_quotes"                 ON maintenance_quotes           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_maintenance"            ON maintenance_requests         WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_mgmt_fee_invoices"      ON management_fee_invoices      WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_municipal_accounts"     ON municipal_accounts           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_municipal_allocs"       ON municipal_bill_allocations   WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_municipal_bills"        ON municipal_bills              WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_clause_defaults"        ON org_lease_clause_defaults    WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_owner_statements"       ON owner_statements             WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_payments"               ON payments                     WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_properties"             ON properties                   WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_annual_summaries"       ON property_annual_summaries    WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_property_documents"     ON property_documents           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_property_photos"        ON property_photos              WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_property_rules"         ON property_rules               WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_rent_invoices"          ON rent_invoices                WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_report_configs"         ON report_configs               WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_supplier_invoices"      ON supplier_invoices            WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_supplier_schedules"     ON supplier_schedules           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_tenancy_history"        ON tenancy_history              WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_tenant_bank"            ON tenant_bank_accounts         WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_tenant_docs"            ON tenant_documents             WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_tenant_next_of_kin"     ON tenant_next_of_kin           WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_tenants"                ON tenants                      WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_unit_clause_defaults"   ON unit_clause_defaults         WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
ALTER POLICY "org_units"                  ON units                        WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));

-- ─── Role-restricted write policies (2) ──────────────────────
-- Pattern: org_id IN (... AND role = ANY (['owner', 'property_manager']))

ALTER POLICY "bank_accounts_org_update" ON bank_accounts WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND role = ANY (ARRAY['owner'::text, 'property_manager'::text]) AND deleted_at IS NULL));
ALTER POLICY "org_invites_update"       ON invites       WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND role = ANY (ARRAY['owner'::text, 'property_manager'::text]) AND deleted_at IS NULL));

-- ─── Contractor-scoped write policies (2) ────────────────────

ALTER POLICY "contractor_own_quotes"       ON maintenance_quotes    WITH CHECK (contractor_id IN (SELECT id FROM contractors WHERE auth_user_id = auth.uid()));
ALTER POLICY "contractor_update_own_jobs"  ON maintenance_requests  WITH CHECK (contractor_id IN (SELECT id FROM contractors WHERE auth_user_id = auth.uid()));

-- ─── Special-pattern policies (5) ────────────────────────────

-- application_tokens: scoped via parent applications table
ALTER POLICY "org_app_tokens" ON application_tokens WITH CHECK (application_id IN (SELECT id FROM applications WHERE org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)));

-- deposit_interest_config: singular org (LIMIT 1 pattern from original)
ALTER POLICY "org_isolation" ON deposit_interest_config WITH CHECK (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

-- lease_templates: allows org_id IS NULL (system-level templates)
ALTER POLICY "org_lease_templates" ON lease_templates WITH CHECK ((org_id IS NULL) OR (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)));

-- organisations: owner updating their own org record
ALTER POLICY "org_owners_update" ON organisations WITH CHECK (id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND role = 'owner'::text AND deleted_at IS NULL));

-- user_profiles: users updating their own profile
ALTER POLICY "profile_own_update" ON user_profiles WITH CHECK (id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- PART C: Cross-org audit helper function
-- ═══════════════════════════════════════════════════════════════
-- Used by security audit Category 2 to verify that data from
-- multiple orgs exists in each table (makes cross-org isolation
-- tests meaningful — single-org DB can't prove RLS is working).

CREATE OR REPLACE FUNCTION count_distinct_orgs(target_table text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result bigint;
BEGIN
  -- Validate table name is alphanumeric/underscore to prevent injection
  IF target_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', target_table;
  END IF;

  EXECUTE format(
    'SELECT COUNT(DISTINCT org_id) FROM public.%I WHERE org_id IS NOT NULL',
    target_table
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execution to service role only (audit uses service key)
REVOKE ALL ON FUNCTION count_distinct_orgs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_distinct_orgs(text) TO service_role;
