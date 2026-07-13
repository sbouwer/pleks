CREATE OR REPLACE FUNCTION record_payment_atomic(
  p_org_id         uuid,
  p_invoice_id     uuid,
  p_amount_cents   bigint,
  p_payment_date   date,
  p_method         text,
  p_reference      text,
  p_recorded_by    uuid,
  p_receipt_number text,
  p_notes          text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv        rent_invoices%ROWTYPE;
  v_payment_id uuid;
BEGIN
  -- Org-scope guard: the invoice MUST belong to the caller's org (service_role bypasses RLS).
  SELECT * INTO v_inv FROM rent_invoices WHERE id = p_invoice_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_payment_atomic: invoice % not found in org %', p_invoice_id, p_org_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 1. payment (provenance only: invoice_id = the agent-selected invoice. Allocation in step 3 follows
  --    clause 6.6, so the money may land on interest / older invoices — surplus_cents + allocated_invoices
  --    are filled by allocate_payment_atomic, NOT pre-credited to the selected invoice).
  INSERT INTO payments (
    org_id, invoice_id, lease_id, tenant_id, amount_cents, payment_date, payment_method,
    reference, receipt_number, recorded_by, surplus_cents, surplus_disposition, allocated_invoices, notes
  ) VALUES (
    p_org_id, p_invoice_id, v_inv.lease_id, v_inv.tenant_id, p_amount_cents, p_payment_date, p_method,
    p_reference, p_receipt_number, p_recorded_by, 0, NULL, '[]'::jsonb, p_notes
  ) RETURNING id INTO v_payment_id;

  -- 2. trust posting (rent_received credit) — sovereignty + closed-period triggers fire here.
  INSERT INTO trust_transactions (
    org_id, transaction_type, direction, amount_cents, description,
    unit_id, lease_id, reference, invoice_id, statement_month, created_by, source, initiated_by
  ) VALUES (
    p_org_id, 'rent_received', 'credit', p_amount_cents,
    'Payment received — ' || upper(p_method) || CASE WHEN p_reference IS NOT NULL AND p_reference <> '' THEN ' ref: ' || p_reference ELSE '' END,
    v_inv.unit_id, v_inv.lease_id, p_receipt_number, p_invoice_id,
    date_trunc('month', CURRENT_DATE)::date, p_recorded_by, 'agency_bank', 'agent'
  );

  -- 3. clause-6.6 allocation — interest oldest-first, then open invoices oldest-first, surplus recorded.
  --    ONE allocation, in-transaction. Replaces the old "credit the selected invoice in full" step + the
  --    post-commit allocatePayment() that TOGETHER double-applied the amount (any partial / interest /
  --    older-invoice case). The selected invoice is advisory — the money follows clause-6.6 order.
  IF v_inv.lease_id IS NOT NULL THEN
    PERFORM allocate_payment_atomic(p_org_id, v_payment_id, v_inv.lease_id, p_amount_cents, p_recorded_by);
  END IF;

  RETURN v_payment_id;
END;
$$;