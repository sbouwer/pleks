-- ============================================================================================
-- supabase/reconcile/00_simulate_prod_drift.sql
--
-- ⚠ THIS SCRIPT MAKES A LOCAL DATABASE WRONG ON PURPOSE. It is NEVER run against production.
--
-- It reproduces, on a local stack, the exact ways PRODUCTION has drifted behind its own committed
-- migrations. Its only job is to make the reconciliation script's proof MEAN something:
--
--   1. reset local from the migrations        → local == the FILES  (green)
--   2. run THIS                               → local == PRODUCTION (the drift, reproduced)
--   3. run `npm run test:db`                  → IT MUST FAIL, and fail on the consent-audit and
--                                               deposit/payment paths — proving the drift is what
--                                               breaks things, not something else
--   4. run 01_reconcile.sql                   → the fix
--   5. run `npm run test:db`                  → green again
--   6. run 01_reconcile.sql A SECOND TIME     → still green (idempotent)
--
-- Without step 2 and 3, "the reconciliation replays green" says only that the files agree with
-- themselves. It would not prove the script FIXES anything, because on a local stack built from the
-- migrations there is nothing to fix.
--
-- Every statement below is a drift VERIFIED against production on 2026-07-13 (SELECT-only queries;
-- see OUTSTANDING § D-DRIFT-02/03 for the evidence).
-- ============================================================================================

-- ── 1. `allocate_payment_atomic` DOES NOT EXIST IN PRODUCTION ────────────────────────────────
-- 100 lines of clause-6.6 allocation, defined in 004 and never deployed. FILE-AHEAD.
DROP FUNCTION IF EXISTS allocate_payment_atomic(uuid, uuid, uuid, bigint, uuid);

-- ── 2. `record_payment_atomic` IS THE PRE-#134 BODY IN PRODUCTION ────────────────────────────
-- It exists in both, and they are NOT the same function: prod credits the invoice inline and never
-- calls allocate_payment_atomic, so there is no interest-first allocation, no surplus spread, no
-- arrears refresh. (Live signature: 191 unwaived arrears_interest_charges that nothing consumes.)
-- This is prod's actual body, restored verbatim.
CREATE OR REPLACE FUNCTION record_payment_atomic(
  p_org_id uuid, p_invoice_id uuid, p_amount_cents bigint, p_payment_date date, p_method text,
  p_reference text, p_recorded_by uuid, p_receipt_number text, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv rent_invoices%ROWTYPE; v_current_balance bigint; v_new_paid bigint;
  v_new_balance bigint; v_surplus bigint; v_status text; v_payment_id uuid;
BEGIN
  SELECT * INTO v_inv FROM rent_invoices WHERE id = p_invoice_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_payment_atomic: invoice % not found in org %', p_invoice_id, p_org_id USING ERRCODE = 'no_data_found';
  END IF;
  v_current_balance := COALESCE(v_inv.balance_cents, v_inv.total_amount_cents - COALESCE(v_inv.amount_paid_cents, 0));
  v_new_paid := COALESCE(v_inv.amount_paid_cents, 0) + p_amount_cents;
  v_new_balance := v_inv.total_amount_cents - v_new_paid;
  v_surplus := GREATEST(0, -v_new_balance);
  v_status := CASE WHEN v_new_balance <= 0 THEN 'paid' WHEN v_new_paid > 0 THEN 'partial' ELSE 'open' END;
  INSERT INTO payments (org_id, invoice_id, lease_id, tenant_id, amount_cents, payment_date, payment_method,
    reference, receipt_number, recorded_by, surplus_cents, surplus_disposition, allocated_invoices, notes)
  VALUES (p_org_id, p_invoice_id, v_inv.lease_id, v_inv.tenant_id, p_amount_cents, p_payment_date, p_method,
    p_reference, p_receipt_number, p_recorded_by, v_surplus,
    CASE WHEN v_surplus > 0 THEN 'pending' ELSE NULL END,
    jsonb_build_array(jsonb_build_object('invoice_id', p_invoice_id, 'amount_cents', LEAST(p_amount_cents, v_current_balance))), p_notes)
  RETURNING id INTO v_payment_id;
  UPDATE rent_invoices SET amount_paid_cents = v_new_paid, balance_cents = GREATEST(0, v_new_balance),
    status = v_status, paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
  WHERE id = p_invoice_id;
  INSERT INTO trust_transactions (org_id, transaction_type, direction, amount_cents, description,
    unit_id, lease_id, reference, invoice_id, statement_month, created_by, source, initiated_by)
  VALUES (p_org_id, 'rent_received', 'credit', p_amount_cents,
    'Payment received - ' || upper(p_method) || CASE WHEN p_reference IS NOT NULL AND p_reference <> '' THEN ' ref: ' || p_reference ELSE '' END,
    v_inv.unit_id, v_inv.lease_id, p_receipt_number, p_invoice_id,
    date_trunc('month', CURRENT_DATE)::date, p_recorded_by, 'agency_bank', 'agent');
  RETURN v_payment_id;
END; $$;

-- ── 3. auth_events.event_type — PRODUCTION HAS NO consent_* TYPES ────────────────────────────
-- §30.2 (2026-05-27) did a DROP+ADD to add the resolver types and its new list omitted all eight
-- consent_* values that §25 had added thirteen days earlier. Every consent-verification audit write
-- has 23514'd since. This is prod's actual constraint.
ALTER TABLE auth_events DROP CONSTRAINT IF EXISTS auth_events_event_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
  'login_success', 'login_failure', 'logout', 'password_changed', 'email_changed',
  'totp_enrolled', 'totp_unenrolled', 'totp_verified', 'totp_failed',
  'passkey_enrolled', 'passkey_unenrolled', 'passkey_verified', 'passkey_failed',
  'step_up_challenged', 'step_up_verified', 'step_up_failed',
  'session_revoked', 'new_device_detected', 'recovery_used', 'role_switched',
  'tenant_portal_login', 'landlord_portal_login', 'supplier_portal_login', 'agent_portal_login',
  'resolver_decision', 'email_existence_check', 'membership_claimed',
  'membership_claim_blocked_by_invariant'
));

-- ── 4. properties.scenario_type — PRODUCTION STOPS AT r5/c4/m2 ───────────────────────────────
-- 012 widened it to r6/r7/c5/c6/m3/m4 in the FILE; that widening was never deployed. So an agent
-- choosing one of those six scenarios today gets "Failed to create property".
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_scenario_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_scenario_type_check CHECK (scenario_type IN (
  'r1', 'r2', 'r3', 'r4', 'r5', 'c1', 'c2', 'c3', 'c4', 'm1', 'm2', 'other'
));

-- ── 5. properties.insurance_policy_type — PRODUCTION LACKS 'farm_specialist' ─────────────────
-- Prod's list, verbatim (queried 2026-07-13 — my first draft GUESSED at it and guessed wrong, which
-- would have made this simulator a fiction that proves nothing).
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_insurance_policy_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_insurance_policy_type_check CHECK (
  insurance_policy_type = ANY (ARRAY[
    'standard_buildings', 'heritage_specialist', 'commercial_property', 'sectional_title', 'other'
  ])
);
