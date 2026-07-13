CREATE OR REPLACE FUNCTION allocate_payment_atomic(
  p_org_id       uuid,
  p_payment_id   uuid,
  p_lease_id     uuid,
  p_amount_cents bigint,
  p_actor        uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remaining        bigint := p_amount_cents;
  v_interest_applied bigint := 0;
  v_rent_applied     bigint := 0;
  v_apply            bigint;
  v_new_balance      bigint;
  v_allocated        jsonb  := '[]'::jsonb;
  v_case_ids         uuid[] := ARRAY[]::uuid[];
  r_charge           record;
  r_inv              record;
  v_case             uuid;
BEGIN
  -- STEP 1 — interest charges, oldest charge_date first (clause 6.6: interest/damages before rent).
  FOR r_charge IN
    SELECT id, interest_cents, arrears_case_id
    FROM arrears_interest_charges
    WHERE lease_id = p_lease_id AND waived = false
    ORDER BY charge_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, r_charge.interest_cents);
    UPDATE arrears_interest_charges
      SET waived = true,
          waived_reason = 'Consumed by payment ' || p_payment_id,
          waived_at = now()
      WHERE id = r_charge.id;
    v_remaining        := v_remaining - v_apply;
    v_interest_applied := v_interest_applied + v_apply;
    IF r_charge.arrears_case_id IS NOT NULL THEN
      v_case_ids := array_append(v_case_ids, r_charge.arrears_case_id);
    END IF;
  END LOOP;

  -- STEP 2 — open rent invoices, oldest due_date first.
  FOR r_inv IN
    SELECT id, balance_cents
    FROM rent_invoices
    WHERE lease_id = p_lease_id AND status IN ('open', 'partial', 'overdue')
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF COALESCE(r_inv.balance_cents, 0) <= 0 THEN CONTINUE; END IF;
    v_apply       := LEAST(v_remaining, r_inv.balance_cents);
    v_new_balance := r_inv.balance_cents - v_apply;
    UPDATE rent_invoices SET
      amount_paid_cents = COALESCE(amount_paid_cents, 0) + v_apply,
      balance_cents     = v_new_balance,
      status            = CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END,
      paid_at           = CASE WHEN v_new_balance <= 0 THEN now() ELSE NULL END
    WHERE id = r_inv.id;
    v_remaining    := v_remaining - v_apply;
    v_rent_applied := v_rent_applied + v_apply;
    v_allocated    := v_allocated || jsonb_build_array(
                        jsonb_build_object('invoice_id', r_inv.id, 'amount_cents', v_apply));
  END LOOP;

  -- STEP 3 — record the breakdown on the payment (surplus = unallocated remainder).
  UPDATE payments SET
    interest_applied_cents = v_interest_applied,
    surplus_cents          = v_remaining,
    surplus_disposition    = CASE WHEN v_remaining > 0 THEN 'pending' ELSE NULL END,
    allocated_invoices     = v_allocated
  WHERE id = p_payment_id;

  -- STEP 4 — refresh arrears interest totals for each touched case.
  FOR v_case IN SELECT DISTINCT unnest(v_case_ids) LOOP
    PERFORM refresh_arrears_interest_total(v_case);
  END LOOP;

  -- STEP 5 — audit the money event with its breakdown (mirrors the old TS payment_allocated audit).
  INSERT INTO audit_log (org_id, table_name, record_id, action, changed_by, new_values)
  VALUES (p_org_id, 'payments', p_payment_id, 'UPDATE', p_actor, jsonb_build_object(
    'action', 'payment_allocated', 'lease_id', p_lease_id,
    'interest_applied_cents', v_interest_applied,
    'rent_applied_cents', v_rent_applied,
    'surplus_cents', v_remaining));

  RETURN jsonb_build_object(
    'interest_applied_cents', v_interest_applied,
    'rent_applied_cents', v_rent_applied,
    'surplus_cents', v_remaining,
    'allocated_invoices', v_allocated);
END;
$$;