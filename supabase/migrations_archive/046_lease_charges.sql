-- 046_lease_charges.sql — Recurring additional charges on leases

CREATE TABLE lease_charges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  description     text NOT NULL,
  charge_type     text NOT NULL DEFAULT 'other'
                  CHECK (charge_type IN (
                    'body_corporate_levy', 'special_levy', 'parking',
                    'water_flat_rate', 'electricity_flat_rate',
                    'garden_service', 'security', 'internet', 'other'
                  )),
  amount_cents    integer NOT NULL,
  start_date      date NOT NULL,
  end_date        date,
  payable_to      text NOT NULL DEFAULT 'landlord'
                  CHECK (payable_to IN ('landlord', 'body_corporate', 'agent', 'third_party')),
  payable_to_contractor_id uuid REFERENCES contractors(id),
  deduct_from_owner_payment boolean NOT NULL DEFAULT false,
  vat_applicable  boolean NOT NULL DEFAULT false,
  vat_rate_percent numeric(5,2) DEFAULT 15.00,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lease_charges_lease ON lease_charges(lease_id);
CREATE INDEX idx_lease_charges_org ON lease_charges(org_id);
CREATE INDEX idx_lease_charges_active ON lease_charges(lease_id, is_active) WHERE is_active = true;

ALTER TABLE lease_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_lease_charges" ON lease_charges
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE TRIGGER update_lease_charges_updated_at
  BEFORE UPDATE ON lease_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
