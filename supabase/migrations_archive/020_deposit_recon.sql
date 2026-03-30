-- 020_deposit_recon.sql — Deposit reconciliation engine

-- Deposit timer (created by lease lifecycle events)
CREATE TABLE IF NOT EXISTS deposit_timers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  inspection_id   uuid REFERENCES inspections(id),
  return_days     integer NOT NULL,
  deadline        date NOT NULL,
  timer_reason    text,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','overdue','disputed')),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deposit_timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_deposit_timers" ON deposit_timers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX idx_deposit_timers_lease ON deposit_timers(lease_id);
CREATE INDEX idx_deposit_timers_status ON deposit_timers(status) WHERE status IN ('running', 'overdue');

-- Deposit deduction items (from inspection — one row per item)
-- Created BEFORE deposit_transactions so FK can reference it
CREATE TABLE deposit_deduction_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  lease_id          uuid NOT NULL REFERENCES leases(id),
  inspection_id     uuid REFERENCES inspections(id),
  inspection_item_id uuid,

  room              text,
  item_description  text NOT NULL,
  classification    text NOT NULL CHECK (classification IN (
                      'tenant_damage',
                      'wear_and_tear',
                      'pre_existing',
                      'disputed'
                    )),

  move_in_photo_path   text,
  move_out_photo_path  text,

  deduction_amount_cents  integer DEFAULT 0,

  ai_justification        text,
  ai_justification_at     timestamptz,
  ai_model                text,

  quote_amount_cents      integer,
  quote_storage_path      text,
  invoice_amount_cents    integer,
  invoice_storage_path    text,

  agent_confirmed         boolean DEFAULT false,
  confirmed_by            uuid REFERENCES auth.users(id),
  confirmed_at            timestamptz,

  tenant_disputed         boolean DEFAULT false,
  dispute_notes           text,
  dispute_resolved        boolean DEFAULT false,
  dispute_resolution      text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deposit_deduction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_deduction_items" ON deposit_deduction_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX idx_deduction_items_lease ON deposit_deduction_items(lease_id);

-- Deposit transactions (per deposit, per event — IMMUTABLE)
CREATE TABLE IF NOT EXISTS deposit_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  transaction_type text NOT NULL CHECK (transaction_type IN (
                    'deposit_received',
                    'interest_accrued',
                    'deduction_applied',
                    'deduction_reversed',
                    'deposit_returned_to_tenant',
                    'deduction_paid_to_landlord',
                    'forfeited'
                  )),
  direction       text NOT NULL CHECK (direction IN ('credit','debit')),
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  reference       text,
  deduction_item_id uuid REFERENCES deposit_deduction_items(id),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
  -- NO update/delete — immutable
);

ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_deposit_txns_select" ON deposit_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_deposit_txns_insert" ON deposit_transactions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
-- NO UPDATE/DELETE policies — immutable

CREATE INDEX idx_deposit_txns_lease ON deposit_transactions(lease_id);

-- Deposit reconciliation record (one per lease at lease end)
CREATE TABLE deposit_reconciliations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  lease_id          uuid NOT NULL UNIQUE REFERENCES leases(id),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  inspection_id     uuid REFERENCES inspections(id),

  deposit_held_cents          integer NOT NULL,
  interest_accrued_cents      integer NOT NULL DEFAULT 0,
  total_available_cents       integer NOT NULL,

  total_deductions_cents      integer NOT NULL DEFAULT 0,
  deduction_items_count       integer NOT NULL DEFAULT 0,

  refund_to_tenant_cents      integer NOT NULL,
  deductions_to_landlord_cents integer NOT NULL DEFAULT 0,

  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                      'draft',
                      'pending_review',
                      'sent_to_tenant',
                      'disputed',
                      'finalised',
                      'refunded',
                      'overdue'
                    )),

  schedule_sent_at        timestamptz,
  schedule_pdf_path       text,
  schedule_sent_to        text,

  tenant_refund_paid_at   timestamptz,
  tenant_refund_reference text,
  landlord_payment_paid_at timestamptz,
  landlord_payment_reference text,

  tribunal_submission_path text,
  tribunal_submitted_at    timestamptz,

  is_forfeited            boolean DEFAULT false,
  forfeiture_reason       text,
  sars_taxable_flagged    boolean DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deposit_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_deposit_recons" ON deposit_reconciliations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
