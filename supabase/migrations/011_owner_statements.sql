-- 011_owner_statements.sql
-- Owner fields on properties, owner statements table
--
-- landlord_id links to the landlords table (backed by contacts).
-- owner_name / owner_email / owner_phone are a denormalised cache for
-- statement generation — populated when a landlord is linked to the property.

-- Extend properties with landlord FK + denormalised owner cache
ALTER TABLE properties ADD COLUMN IF NOT EXISTS landlord_id uuid REFERENCES landlords(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_name text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_account text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_branch text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_type text
  CHECK (owner_bank_type IN ('cheque', 'savings', 'transmission'));
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_tax_number text;

CREATE INDEX IF NOT EXISTS idx_properties_landlord_id ON properties(landlord_id);

-- Owner statements
CREATE TABLE owner_statements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  property_id         uuid NOT NULL REFERENCES properties(id),
  landlord_id         uuid REFERENCES landlords(id),
  period_month        date NOT NULL,
  period_from         date NOT NULL,
  period_to           date NOT NULL,
  gross_income_cents          integer NOT NULL DEFAULT 0,
  total_expenses_cents        integer NOT NULL DEFAULT 0,
  management_fee_cents        integer NOT NULL DEFAULT 0,
  management_fee_vat_cents    integer NOT NULL DEFAULT 0,
  net_to_owner_cents          integer NOT NULL DEFAULT 0,
  deposits_held_cents         integer NOT NULL DEFAULT 0,
  deposit_interest_cents      integer NOT NULL DEFAULT 0,
  income_lines        jsonb DEFAULT '[]',
  expense_lines       jsonb DEFAULT '[]',
  arrears_lines       jsonb DEFAULT '[]',
  owner_payment_date    date,
  owner_payment_ref     text,
  owner_payment_status  text DEFAULT 'pending'
                        CHECK (owner_payment_status IN ('pending', 'paid', 'on_hold', 'partial')),
  owner_payment_cents   integer,
  owner_payment_notes   text,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'generated', 'sent', 'viewed', 'archived')),
  pdf_storage_path    text,
  sent_at             timestamptz,
  viewed_at           timestamptz,
  portal_token        text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  portal_token_expires_at timestamptz DEFAULT now() + interval '90 days',
  agent_notes         text,
  internal_notes      text,
  generated_by        uuid REFERENCES auth.users(id),
  generated_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_owner_statements_updated_at
  BEFORE UPDATE ON owner_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_owner_statements_org      ON owner_statements(org_id);
CREATE INDEX idx_owner_statements_property ON owner_statements(property_id);
CREATE INDEX idx_owner_statements_period   ON owner_statements(period_month);
CREATE INDEX idx_owner_statements_token    ON owner_statements(portal_token);

ALTER TABLE owner_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_owner_statements" ON owner_statements
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
