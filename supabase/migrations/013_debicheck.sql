-- 013_debicheck.sql
-- DebiCheck mandates, collections, tenant bank accounts

CREATE TABLE debicheck_mandates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  lease_id              uuid NOT NULL REFERENCES leases(id),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  unit_id               uuid NOT NULL REFERENCES units(id),
  peach_mandate_id      text UNIQUE,
  peach_merchant_txn_id text,
  amount_cents          integer NOT NULL,
  billing_day           integer NOT NULL CHECK (billing_day BETWEEN 1 AND 28),
  start_date            date NOT NULL,
  description           text NOT NULL,
  debtor_account_number text,
  debtor_bank_code      text,
  debtor_account_type   text,
  debtor_name           text,
  status                text NOT NULL DEFAULT 'pending_authentication'
                        CHECK (status IN (
                          'pending_authentication', 'authenticated', 'active',
                          'failed_authentication', 'suspended', 'cancelled', 'amended'
                        )),
  authenticated_at      timestamptz,
  authentication_method text,
  cancelled_at          timestamptz,
  cancelled_by          text CHECK (cancelled_by IN ('tenant', 'agent', 'system', 'bank')),
  cancellation_reason   text,
  first_collection_date date,
  last_collection_date  date,
  amended_by_mandate_id uuid REFERENCES debicheck_mandates(id),
  amendment_reason      text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_debicheck_mandates_updated_at
  BEFORE UPDATE ON debicheck_mandates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_debicheck_org ON debicheck_mandates(org_id);
CREATE INDEX idx_debicheck_lease ON debicheck_mandates(lease_id);
CREATE INDEX idx_debicheck_status ON debicheck_mandates(status);

ALTER TABLE debicheck_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_mandates" ON debicheck_mandates
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "tenant_own_mandate" ON debicheck_mandates
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );

-- Collections
CREATE TABLE debicheck_collections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  mandate_id            uuid NOT NULL REFERENCES debicheck_mandates(id),
  lease_id              uuid NOT NULL REFERENCES leases(id),
  rent_invoice_id       uuid REFERENCES rent_invoices(id),
  peach_collection_id   text UNIQUE,
  peach_merchant_txn_id text,
  amount_cents          integer NOT NULL,
  collection_date       date NOT NULL,
  description           text,
  status                text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN (
                          'scheduled', 'submitted', 'successful',
                          'failed', 'returned', 'cancelled'
                        )),
  failure_code          text,
  failure_reason        text,
  failure_reason_human  text,
  is_retry              boolean DEFAULT false,
  retry_of_collection_id uuid REFERENCES debicheck_collections(id),
  retry_count           integer DEFAULT 0,
  next_retry_date       date,
  bank_statement_line_id uuid REFERENCES bank_statement_lines(id),
  submitted_at          timestamptz,
  processed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_mandate ON debicheck_collections(mandate_id);
CREATE INDEX idx_collections_lease ON debicheck_collections(lease_id);
CREATE INDEX idx_collections_status ON debicheck_collections(status);
CREATE INDEX idx_collections_date ON debicheck_collections(collection_date);

ALTER TABLE debicheck_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_collections" ON debicheck_collections
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Tenant bank accounts
CREATE TABLE tenant_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  bank_name       text NOT NULL,
  account_holder  text NOT NULL,
  account_number  text NOT NULL,
  branch_code     text,
  account_type    text CHECK (account_type IN ('current', 'savings', 'transmission')),
  is_primary      boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tenant_bank" ON tenant_bank_accounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
