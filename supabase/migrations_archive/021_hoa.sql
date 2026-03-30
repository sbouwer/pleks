-- 021_hoa.sql — HOA / Body Corporate module (Firm tier)

-- HOA / Body Corporate entity
CREATE TABLE hoa_entities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  entity_type       text NOT NULL CHECK (entity_type IN (
                      'body_corporate', 'hoa', 'share_block', 'poa'
                    )),
  name              text NOT NULL,
  registration_number text,
  csos_registration_number text,
  csos_registered_at date,
  csos_annual_return_due date,
  financial_year_end_month integer DEFAULT 2,
  managing_agent_name text,
  trustees_count    integer DEFAULT 3,
  registered_address text,
  is_active         boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hoa_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_hoa" ON hoa_entities
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE INDEX idx_hoa_org ON hoa_entities(org_id);
CREATE INDEX idx_hoa_property ON hoa_entities(property_id);

-- HOA unit owners (distinct from rental tenants)
CREATE TABLE hoa_unit_owners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  hoa_id          uuid NOT NULL REFERENCES hoa_entities(id),
  unit_id         uuid NOT NULL REFERENCES units(id),
  owner_type      text NOT NULL CHECK (owner_type IN (
                    'individual', 'company', 'trust', 'cc'
                  )),
  owner_name      text NOT NULL,
  owner_email     text,
  owner_phone     text,
  id_number       text,
  registration_number text,
  participation_quota numeric(10,6),
  owned_from      date,
  owned_until     date,
  bank_name       text,
  bank_account    text,
  is_trustee      boolean DEFAULT false,
  is_active       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hoa_unit_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_hoa_owners" ON hoa_unit_owners
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE INDEX idx_hoa_owners_hoa ON hoa_unit_owners(hoa_id);
CREATE INDEX idx_hoa_owners_unit ON hoa_unit_owners(unit_id);

-- Levy schedules (with calculation method per addendum)
CREATE TABLE levy_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  hoa_id              uuid NOT NULL REFERENCES hoa_entities(id),
  building_id         uuid REFERENCES buildings(id),
  schedule_type       text NOT NULL CHECK (schedule_type IN (
                        'admin_levy', 'reserve_levy', 'special_levy', 'utility_recovery'
                      )),
  description         text NOT NULL,
  total_budget_cents  integer NOT NULL,
  calculation_method  text NOT NULL DEFAULT 'participation_quota'
                      CHECK (calculation_method IN (
                        'participation_quota', 'floor_area_m2', 'equal_split',
                        'fixed_amount', 'percentage_of_budget', 'manual'
                      )),
  admin_reserve_split_percent numeric(5,2) DEFAULT 80.00,
  effective_from      date NOT NULL,
  effective_to        date,
  agm_resolution_id   uuid,
  is_active           boolean DEFAULT true,
  approved_at         timestamptz,
  approved_by_trustees boolean DEFAULT false,
  include_vacant_units boolean DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE levy_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_levy_schedules" ON levy_schedules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Pre-calculated levy amounts per unit (cache)
CREATE TABLE levy_unit_amounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  schedule_id         uuid NOT NULL REFERENCES levy_schedules(id) ON DELETE CASCADE,
  hoa_id              uuid NOT NULL REFERENCES hoa_entities(id),
  unit_id             uuid NOT NULL REFERENCES units(id),
  owner_id            uuid NOT NULL REFERENCES hoa_unit_owners(id),
  percentage          numeric(10,6),
  fixed_cents         integer,
  calculated_cents    integer,
  basis_pq            numeric(10,6),
  basis_m2            numeric(8,2),
  basis_total_m2      numeric(10,2),
  basis_total_units   integer,
  is_validated        boolean DEFAULT false,
  validation_warning  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, unit_id)
);

ALTER TABLE levy_unit_amounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_levy_unit_amounts" ON levy_unit_amounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE INDEX idx_levy_unit_amounts_schedule ON levy_unit_amounts(schedule_id);
CREATE INDEX idx_levy_unit_amounts_owner ON levy_unit_amounts(owner_id);

-- Levy invoices (per owner per month)
CREATE TABLE levy_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  hoa_id          uuid NOT NULL REFERENCES hoa_entities(id),
  unit_id         uuid NOT NULL REFERENCES units(id),
  owner_id        uuid NOT NULL REFERENCES hoa_unit_owners(id),
  schedule_id     uuid NOT NULL REFERENCES levy_schedules(id),
  invoice_number  text UNIQUE NOT NULL,
  invoice_date    date NOT NULL,
  due_date        date NOT NULL,
  period_month    date NOT NULL,
  admin_levy_cents    integer NOT NULL DEFAULT 0,
  reserve_levy_cents  integer NOT NULL DEFAULT 0,
  special_levy_cents  integer NOT NULL DEFAULT 0,
  arrears_cents       integer NOT NULL DEFAULT 0,
  interest_cents      integer NOT NULL DEFAULT 0,
  total_cents         integer NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','partial','paid','overdue','cancelled')),
  amount_paid_cents integer DEFAULT 0,
  balance_cents     integer,
  paid_at           timestamptz,
  receipt_sent_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE levy_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_levy_invoices" ON levy_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE INDEX idx_levy_invoices_hoa ON levy_invoices(hoa_id);
CREATE INDEX idx_levy_invoices_owner ON levy_invoices(owner_id);
CREATE INDEX idx_levy_invoices_status ON levy_invoices(status);

-- AGM records
CREATE TABLE agm_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  hoa_id          uuid NOT NULL REFERENCES hoa_entities(id),
  agm_type        text NOT NULL CHECK (agm_type IN ('agm','sgm','trustees_meeting')),
  meeting_date    date NOT NULL,
  meeting_time    time,
  location        text,
  is_virtual      boolean DEFAULT false,
  virtual_link    text,
  notice_pdf_path text,
  notice_sent_at  timestamptz,
  agenda_pdf_path text,
  minutes_pdf_path text,
  status          text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN (
                    'scheduled','notice_sent','held','minutes_pending',
                    'minutes_distributed','complete'
                  )),
  quorum_achieved boolean,
  attendees_count integer,
  proxy_count     integer,
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agm_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_agm" ON agm_records
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- AGM resolutions
CREATE TABLE agm_resolutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  agm_id          uuid NOT NULL REFERENCES agm_records(id),
  resolution_number integer,
  resolution_type text CHECK (resolution_type IN ('ordinary','special','unanimous')),
  description     text NOT NULL,
  result          text CHECK (result IN ('passed','failed','deferred')),
  votes_for       integer,
  votes_against   integer,
  votes_abstained integer,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agm_resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_agm_resolutions" ON agm_resolutions
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Reserve fund entries (immutable)
CREATE TABLE reserve_fund_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  hoa_id          uuid NOT NULL REFERENCES hoa_entities(id),
  entry_type      text NOT NULL CHECK (entry_type IN (
                    'levy_contribution', 'capital_expenditure', 'interest_earned', 'adjustment'
                  )),
  direction       text NOT NULL CHECK (direction IN ('credit','debit')),
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  reference       text,
  maintenance_request_id uuid,
  supplier_invoice_id uuid,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reserve_fund_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_reserve_select" ON reserve_fund_entries
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_reserve_insert" ON reserve_fund_entries
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE INDEX idx_reserve_fund_hoa ON reserve_fund_entries(hoa_id);

-- Add FK for agm_resolution_id on levy_schedules (deferred to avoid circular dependency)
ALTER TABLE levy_schedules ADD CONSTRAINT fk_levy_agm_resolution
  FOREIGN KEY (agm_resolution_id) REFERENCES agm_resolutions(id);
