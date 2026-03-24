-- 010_financials.sql
-- Trust transactions, rent invoices, payments, management fees, annual summaries

-- Extend organisations with management fee settings
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_percent numeric(5,2) DEFAULT 10.00;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_type text DEFAULT 'percent'
  CHECK (management_fee_type IN ('percent', 'fixed'));
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_fixed_cents integer;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_vat_applicable boolean DEFAULT false;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS deposit_interest_rate_percent numeric(5,2) DEFAULT 5.00;

-- Trust ledger (immutable — NO update/delete)
CREATE TABLE trust_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid REFERENCES properties(id),
  unit_id         uuid REFERENCES units(id),
  lease_id        uuid REFERENCES leases(id),
  owner_ref       text,
  transaction_type text NOT NULL CHECK (transaction_type IN (
                    'rent_received', 'deposit_received', 'deposit_interest',
                    'expense_paid', 'management_fee', 'owner_payment',
                    'deposit_returned', 'deposit_deduction', 'adjustment'
                  )),
  direction       text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  reference       text,
  invoice_id      uuid,
  supplier_invoice_id uuid REFERENCES supplier_invoices(id),
  statement_month date,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trust_tx_org ON trust_transactions(org_id);
CREATE INDEX idx_trust_tx_property ON trust_transactions(property_id);
CREATE INDEX idx_trust_tx_statement_month ON trust_transactions(statement_month);

ALTER TABLE trust_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_trust_tx_select" ON trust_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_trust_tx_insert" ON trust_transactions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Rent invoices
CREATE TABLE rent_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  unit_id         uuid NOT NULL REFERENCES units(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  invoice_number  text UNIQUE NOT NULL,
  invoice_date    date NOT NULL,
  due_date        date NOT NULL,
  period_from     date NOT NULL,
  period_to       date NOT NULL,
  rent_amount_cents    integer NOT NULL,
  other_charges_cents  integer DEFAULT 0,
  total_amount_cents   integer NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'partial', 'paid', 'overdue', 'cancelled', 'credit')),
  amount_paid_cents    integer DEFAULT 0,
  balance_cents        integer,
  paid_at              timestamptz,
  receipt_sent_at      timestamptz,
  receipt_storage_path text,
  notes                text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_rent_invoices_updated_at
  BEFORE UPDATE ON rent_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_rent_invoices_org ON rent_invoices(org_id);
CREATE INDEX idx_rent_invoices_lease ON rent_invoices(lease_id);
CREATE INDEX idx_rent_invoices_due_date ON rent_invoices(due_date);
CREATE INDEX idx_rent_invoices_status ON rent_invoices(status);

ALTER TABLE rent_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_rent_invoices" ON rent_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "tenant_own_invoices" ON rent_invoices
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );

-- Payments
CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  invoice_id      uuid REFERENCES rent_invoices(id),
  lease_id        uuid REFERENCES leases(id),
  tenant_id       uuid REFERENCES tenants(id),
  amount_cents    integer NOT NULL,
  payment_date    date NOT NULL,
  payment_method  text NOT NULL CHECK (payment_method IN (
                    'eft', 'debicheck', 'cash', 'card', 'bank_recon_matched'
                  )),
  reference       text,
  allocated_invoices jsonb DEFAULT '[]',
  surplus_cents   integer DEFAULT 0,
  surplus_disposition text CHECK (surplus_disposition IN (
                    'credit_next_month', 'refund_to_tenant', 'pending'
                  )),
  bank_statement_line_id uuid,
  recon_method    text CHECK (recon_method IN ('manual', 'exact_match', 'fuzzy_match', 'ai_match')),
  receipt_number  text,
  receipt_sent_at timestamptz,
  recorded_by     uuid REFERENCES auth.users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_org ON payments(org_id);
CREATE INDEX idx_payments_lease ON payments(lease_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_payments" ON payments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "tenant_own_payments" ON payments
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );

-- Management fee invoices
CREATE TABLE management_fee_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid REFERENCES properties(id),
  period_month    date NOT NULL,
  gross_rent_collected_cents integer NOT NULL,
  fee_percent     numeric(5,2),
  fee_amount_cents integer NOT NULL,
  vat_amount_cents integer DEFAULT 0,
  total_cents     integer NOT NULL,
  status          text NOT NULL DEFAULT 'generated'
                  CHECK (status IN ('generated', 'deducted', 'invoiced_to_owner', 'paid')),
  deducted_at     timestamptz,
  invoice_number  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE management_fee_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_mgmt_fee_invoices" ON management_fee_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Property annual summaries (SARS ITR12 aligned)
CREATE TABLE property_annual_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid NOT NULL REFERENCES properties(id),
  tax_year_start  date NOT NULL,
  tax_year_end    date NOT NULL,
  gross_rental_income_cents     integer DEFAULT 0,
  deduction_bond_interest_cents      integer DEFAULT 0,
  deduction_rates_taxes_cents        integer DEFAULT 0,
  deduction_insurance_cents          integer DEFAULT 0,
  deduction_repairs_maintenance_cents integer DEFAULT 0,
  deduction_management_fees_cents    integer DEFAULT 0,
  deduction_garden_services_cents    integer DEFAULT 0,
  deduction_security_cents           integer DEFAULT 0,
  deduction_advertising_cents        integer DEFAULT 0,
  deduction_levies_cents             integer DEFAULT 0,
  deduction_other_cents              integer DEFAULT 0,
  total_deductions_cents             integer DEFAULT 0,
  net_taxable_rental_income_cents    integer DEFAULT 0,
  capital_improvements_cents         integer DEFAULT 0,
  is_provisional_taxpayer_threshold_exceeded boolean DEFAULT false,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_annual_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_annual_summaries" ON property_annual_summaries
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
