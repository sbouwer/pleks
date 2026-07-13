
-- §4 ── REAL FIX · properties.scenario_type — SIX SCENARIOS CANNOT BE CREATED TODAY ─────────────
--
-- 012 widened this in the FILE, and the widening was never deployed. An agent who picks r6, r7, c5,
-- c6, m3 or m4 in the property wizard gets "Failed to create property". A LOUD failure — nothing has
-- been silently corrupted — but the feature simply does not work. FILE-AHEAD → deploy.
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_scenario_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_scenario_type_check CHECK (scenario_type IN (
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6',
  'm1', 'm2', 'm3', 'm4',
  'other'
));


-- §5 ── REAL FIX · properties.insurance_policy_type — 'farm_specialist' ─────────────────────────
-- Same shape, smaller blast radius. Production's CURRENT list plus the value the file declares.
-- Additive. (My first draft of the drift simulator GUESSED this list and guessed wrong; it is now
-- prod's, queried verbatim. A simulator built on a guess proves nothing.)
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_insurance_policy_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_insurance_policy_type_check CHECK (
  insurance_policy_type = ANY (ARRAY[
    'standard_buildings', 'heritage_specialist', 'commercial_property', 'sectional_title',
    'farm_specialist', 'other'
  ])
);


-- §6 ── VERIFIED NO-OP · contractors.supplier_type ──────────────────────────────────────────────
-- Production has accepted these six values for months — widened out-of-band, never captured in any
-- migration. Re-stating it changes NOTHING live. It is here so a LOCAL stack rebuilt from the files
-- tells the same truth as production, which is the whole reason the vendor-import tests were failing
-- on values that work fine in prod. PROD-AHEAD → the file has caught up (005, already merged).
ALTER TABLE contractors DROP CONSTRAINT IF EXISTS contractors_supplier_type_check;
ALTER TABLE contractors ADD CONSTRAINT contractors_supplier_type_check CHECK (
  supplier_type IN ('contractor', 'recurring', 'both', 'managing_scheme', 'utility', 'other')
);


-- §7 ── VERIFIED NO-OP · consent_log.consent_type ───────────────────────────────────────────────
-- 'bank_details_import' is ALREADY live in production. Re-stated for the same reason as §6, so a
-- local stack and production agree. Changes nothing live.
ALTER TABLE consent_log DROP CONSTRAINT IF EXISTS consent_log_consent_type_check;
ALTER TABLE consent_log ADD CONSTRAINT consent_log_consent_type_check CHECK (consent_type IN (
  'credit_check', 'data_processing', 'marketing', 'trust_account_notice',
  'popia_application', 'lease_template_disclaimer', 'bank_details_import'
));

COMMIT;

-- ==================================================================================================
-- DELIBERATELY NOT IN THIS SCRIPT — each one a decision, not an omission
--
--   · check_trust_txn_period_open (the BEFORE-DELETE `RETURN NEW` swallow) — ALREADY FIXED IN PROD.
--     Verified 2026-07-13: production's body carries RETURN COALESCE(NEW, OLD). No DDL needed. It was
--     ranked #2 on the board; it is done.
--
--   · subscriptions.trial_tier = 'bespoke' — FILE-AHEAD, but INERT: the sole writer's TypeScript union
--     is ("steward" | "growth" | "portfolio" | "firm"), so no caller can pass it. Widening production
--     for a value nothing writes is speculation, not reconciliation. Left as an open register item.
--
--   · contacts.primary_role = 'company_contact' — PROD-AHEAD. The fix is to amend the FILE forward,
--     not to change production. No DDL.
--
--   · deposit_rate_status — NOT a manifest RED. The column does not exist and nothing references it:
--     the only two hits in the codebase are COMMENTS explaining why it was deliberately never
--     persisted (a stamped status column would have held a lease forever after its config was fixed).
--     schema-contract-scan is green.
--
-- ── D-GL-01 — RESOLVED: EXEMPT BY NATURE. DO NOT STAMP. No DDL. ────────────────────────────────
--
--   The lean is correct AND the collision is real — it is on trust_transactions, not
--   deposit_transactions, which is why a search of the latter found nothing:
--
--       CREATE UNIQUE INDEX idx_trust_txn_one_opening_per_period
--         ON public.trust_transactions (org_id, statement_month) WHERE (is_opening_balance = true)
--
--   Verified live in production. Stamping each GL row with its own month therefore caps the whole
--   import at ONE row per org per month — which the money-conservation test caught instantly (three
--   payments in one month → one landed, two rejected).
--
--   And the guard already handles it: check_trust_txn_insert_period_open RETURNS NEW when
--   statement_month IS NULL, and opening balances are NULL — so they already pass. An opening balance
--   is the STARTING LINE, not a back-dated transaction: it represents pre-cutover state the agency
--   managed under another system, and a period Pleks never reconciled cannot meaningfully be "closed"
--   against it. Exempt by nature. No stamp, no collision, nothing to deploy.
-- ==================================================================================================
