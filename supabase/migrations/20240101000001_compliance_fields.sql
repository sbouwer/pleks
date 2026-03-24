-- 001b_compliance_fields.sql
-- Adds onboarding compliance fields to organisations (BUILD_01B)

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_scope text
  CHECK (management_scope IN ('own_only', 'own_and_others', 'others_only'));

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS property_types text[] DEFAULT '{}';

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ppra_status text DEFAULT 'unknown'
  CHECK (ppra_status IN ('registered', 'pending', 'not_registered', 'unknown'));

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ppra_ffc_number text;

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS has_deposit_account boolean DEFAULT false;

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS deposit_account_type text
  CHECK (deposit_account_type IN ('interest_bearing', 'ppra_trust', 'none'));

-- Bank accounts table (for trust + deposit holding accounts)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  type            text NOT NULL CHECK (type IN ('trust', 'business', 'deposit_holding', 'ppra_trust')),
  bank_name       text NOT NULL,
  account_holder  text NOT NULL,
  account_number  text,
  branch_code     text,
  account_type    text CHECK (account_type IN ('cheque', 'savings', 'transmission')),
  ppra_ref        text,
  is_verified     boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts_org_select" ON bank_accounts
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "bank_accounts_org_insert" ON bank_accounts
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND role IN ('owner', 'property_manager') AND deleted_at IS NULL
    )
  );

CREATE POLICY "bank_accounts_org_update" ON bank_accounts
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND role IN ('owner', 'property_manager') AND deleted_at IS NULL
    )
  );

CREATE INDEX idx_bank_accounts_org_id ON bank_accounts(org_id);
