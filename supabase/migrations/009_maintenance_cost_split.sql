-- ADDENDUM_06A: Maintenance cost split — landlord / tenant / other allocation

-- 1. Extend trust_transactions to support maintenance_expense type
ALTER TABLE trust_transactions
  DROP CONSTRAINT IF EXISTS trust_transactions_transaction_type_check;

ALTER TABLE trust_transactions
  ADD CONSTRAINT trust_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'rent_received', 'deposit_received', 'deposit_interest',
    'expense_paid', 'management_fee', 'owner_payment',
    'deposit_returned', 'deposit_deduction', 'adjustment',
    'maintenance_expense'
  ));

-- 2. Add maintenance_request_id to trust_transactions for traceability
ALTER TABLE trust_transactions
  ADD COLUMN IF NOT EXISTS maintenance_request_id uuid REFERENCES maintenance_requests(id);

-- 3. Cost allocation table
CREATE TABLE IF NOT EXISTS maintenance_cost_allocations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES organisations(id),
  request_id                uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,

  allocation_type           text NOT NULL CHECK (allocation_type IN (
                              'landlord_expense',
                              'tenant_charge',
                              'insurance_claim',
                              'hoa_levy'
                            )),

  amount_cents              int NOT NULL,
  description               text NOT NULL,
  lease_clause_ref          text,

  -- For tenant charges: how to collect
  collection_method         text CHECK (collection_method IN (
                              'next_invoice',
                              'separate_invoice',
                              'deposit_deduction',
                              'already_paid'
                            )),

  -- Collection tracking
  invoice_id                uuid,
  added_to_invoice_at       timestamptz,
  deposit_deduction_item_id uuid,

  created_by                uuid NOT NULL REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE maintenance_cost_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON maintenance_cost_allocations
  USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE INDEX IF NOT EXISTS idx_maint_alloc_request ON maintenance_cost_allocations(request_id);
CREATE INDEX IF NOT EXISTS idx_maint_alloc_org     ON maintenance_cost_allocations(org_id);
