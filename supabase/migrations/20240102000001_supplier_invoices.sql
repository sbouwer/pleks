-- 009b_supplier_invoices.sql
-- Extend contractors, supplier schedules, supplier invoices

-- Extend contractors table
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS supplier_type text DEFAULT 'contractor'
  CHECK (supplier_type IN ('contractor', 'recurring', 'both'));
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS vat_registered boolean DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS banking_name text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bank_branch_code text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bank_account_type text
  CHECK (bank_account_type IN ('cheque', 'savings', 'transmission'));

-- Recurring supplier schedules
CREATE TABLE supplier_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  contractor_id   uuid NOT NULL REFERENCES contractors(id),
  property_id     uuid REFERENCES properties(id),
  unit_id         uuid REFERENCES units(id),
  description     text NOT NULL,
  category        text NOT NULL,
  frequency       text NOT NULL CHECK (frequency IN (
                    'weekly', 'monthly', 'quarterly', 'bi_annual', 'annual', 'ad_hoc'
                  )),
  expected_amount_cents integer,
  next_due_date   date,
  is_active       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_supplier_schedules_updated_at
  BEFORE UPDATE ON supplier_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE supplier_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_supplier_schedules" ON supplier_schedules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Supplier invoices
CREATE TABLE supplier_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  contractor_id       uuid REFERENCES contractors(id),
  maintenance_request_id uuid REFERENCES maintenance_requests(id),
  schedule_id         uuid REFERENCES supplier_schedules(id),
  property_id         uuid REFERENCES properties(id),
  unit_id             uuid REFERENCES units(id),
  invoice_number      text,
  invoice_date        date NOT NULL,
  due_date            date,
  description         text NOT NULL,
  amount_excl_vat_cents integer NOT NULL,
  vat_amount_cents    integer NOT NULL DEFAULT 0,
  amount_incl_vat_cents integer NOT NULL,
  payment_source      text NOT NULL DEFAULT 'trust'
                      CHECK (payment_source IN ('trust', 'agency', 'owner_direct')),
  owner_id            uuid,
  trust_account_id    uuid,
  status              text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN (
                        'submitted', 'under_review', 'approved', 'pending_payment',
                        'paid', 'rejected', 'disputed', 'owner_direct_recorded'
                      )),
  reviewed_by         uuid REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  rejection_reason    text,
  dispute_notes       text,
  paid_at             timestamptz,
  paid_by             uuid REFERENCES auth.users(id),
  payment_reference   text,
  payment_notes       text,
  invoice_storage_path text,
  ai_extracted        boolean DEFAULT false,
  ai_extracted_data   jsonb,
  include_on_statement boolean DEFAULT true,
  statement_month     date,
  statement_line_description text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_supplier_invoices_org ON supplier_invoices(org_id);
CREATE INDEX idx_supplier_invoices_request ON supplier_invoices(maintenance_request_id);
CREATE INDEX idx_supplier_invoices_property ON supplier_invoices(property_id);
CREATE INDEX idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX idx_supplier_invoices_statement_month ON supplier_invoices(statement_month);

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_supplier_invoices" ON supplier_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
