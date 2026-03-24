-- 016_municipal_bills.sql
-- Municipal accounts, bills, allocations

CREATE TABLE municipal_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  account_number    text NOT NULL,
  municipality_name text NOT NULL,
  municipality_code text,
  service_address   text,
  account_holder    text,
  includes_rates        boolean DEFAULT true,
  includes_water        boolean DEFAULT true,
  includes_electricity  boolean DEFAULT false,
  includes_refuse       boolean DEFAULT true,
  includes_sewerage     boolean DEFAULT true,
  electricity_prepaid   boolean DEFAULT false,
  billing_day           integer,
  is_active             boolean DEFAULT true,
  notes                 text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_municipal_accounts_updated_at
  BEFORE UPDATE ON municipal_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_municipal_accounts_property ON municipal_accounts(property_id);
CREATE INDEX idx_municipal_accounts_org ON municipal_accounts(org_id);

ALTER TABLE municipal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_municipal_accounts" ON municipal_accounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Municipal bills
CREATE TABLE municipal_bills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  property_id         uuid NOT NULL REFERENCES properties(id),
  municipal_account_id uuid NOT NULL REFERENCES municipal_accounts(id),
  pdf_storage_path    text NOT NULL,
  original_filename   text,
  file_size_bytes     integer,
  billing_period_from date,
  billing_period_to   date,
  billing_month       date,
  due_date            date,
  extraction_status   text NOT NULL DEFAULT 'pending'
                      CHECK (extraction_status IN (
                        'pending', 'extracting', 'extracted',
                        'needs_review', 'confirmed', 'failed'
                      )),
  extracted_at        timestamptz,
  extraction_confidence numeric(3,2),
  extraction_notes    text,
  charge_rates_cents          integer DEFAULT 0,
  charge_water_cents          integer DEFAULT 0,
  charge_sewerage_cents       integer DEFAULT 0,
  charge_electricity_cents    integer DEFAULT 0,
  charge_refuse_cents         integer DEFAULT 0,
  charge_vat_cents            integer DEFAULT 0,
  charge_levies_cents         integer DEFAULT 0,
  charge_penalties_cents      integer DEFAULT 0,
  charge_other_cents          integer DEFAULT 0,
  total_current_charges_cents integer DEFAULT 0,
  previous_balance_cents      integer DEFAULT 0,
  payments_received_cents     integer DEFAULT 0,
  total_amount_due_cents      integer DEFAULT 0,
  arrears_cents               integer DEFAULT 0,
  water_reading_previous      numeric(10,3),
  water_reading_current       numeric(10,3),
  water_consumption_kl        numeric(10,3),
  electricity_reading_previous numeric(10,3),
  electricity_reading_current  numeric(10,3),
  electricity_consumption_kwh  numeric(10,3),
  agent_confirmed         boolean DEFAULT false,
  confirmed_by            uuid REFERENCES auth.users(id),
  confirmed_at            timestamptz,
  agent_notes             text,
  payment_status          text NOT NULL DEFAULT 'unpaid'
                          CHECK (payment_status IN ('unpaid', 'paid', 'partial', 'overdue')),
  paid_at                 timestamptz,
  payment_reference       text,
  supplier_invoice_id     uuid REFERENCES supplier_invoices(id),
  allocation_status       text NOT NULL DEFAULT 'unallocated'
                          CHECK (allocation_status IN ('unallocated', 'allocated', 'not_required')),
  uploaded_by             uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_municipal_bills_updated_at
  BEFORE UPDATE ON municipal_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_municipal_bills_property ON municipal_bills(property_id);
CREATE INDEX idx_municipal_bills_period ON municipal_bills(billing_month);
CREATE INDEX idx_municipal_bills_status ON municipal_bills(extraction_status);

ALTER TABLE municipal_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_municipal_bills" ON municipal_bills
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Per-unit allocations
CREATE TABLE municipal_bill_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  bill_id         uuid NOT NULL REFERENCES municipal_bills(id) ON DELETE CASCADE,
  unit_id         uuid NOT NULL REFERENCES units(id),
  lease_id        uuid REFERENCES leases(id),
  tenant_id       uuid REFERENCES tenants(id),
  allocation_method text NOT NULL DEFAULT 'equal_split'
                    CHECK (allocation_method IN (
                      'equal_split', 'occupied_only', 'meter_reading',
                      'floor_area', 'manual'
                    )),
  rates_cents         integer DEFAULT 0,
  water_cents         integer DEFAULT 0,
  sewerage_cents      integer DEFAULT 0,
  electricity_cents   integer DEFAULT 0,
  refuse_cents        integer DEFAULT 0,
  other_cents         integer DEFAULT 0,
  total_cents         integer DEFAULT 0,
  recover_from_tenant   boolean DEFAULT false,
  tenant_invoiced       boolean DEFAULT false,
  tenant_invoice_id     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_municipal_allocs_bill ON municipal_bill_allocations(bill_id);
CREATE INDEX idx_municipal_allocs_unit ON municipal_bill_allocations(unit_id);

ALTER TABLE municipal_bill_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_municipal_allocs" ON municipal_bill_allocations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
