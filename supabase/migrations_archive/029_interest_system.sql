-- 029_interest_system.sql — Interest calculation: prime rates, deposit interest, arrears interest

-- ─── PART 1: Prime rate table ───────────────────────────────

CREATE TABLE prime_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_percent   numeric(5,2) NOT NULL,
  effective_date date NOT NULL,
  mpc_meeting_date date,
  notes          text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO prime_rates (rate_percent, effective_date, notes)
VALUES (11.25, '2024-01-01', 'Seed rate — update with actual effective date');

CREATE OR REPLACE FUNCTION get_prime_rate_on(check_date date)
RETURNS numeric AS $$
  SELECT rate_percent
  FROM prime_rates
  WHERE effective_date <= check_date
  ORDER BY effective_date DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ─── PART 2: Lease interest settings ────────────────────────

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS deposit_interest_rate_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS deposit_interest_last_accrued_date date,
  ADD COLUMN IF NOT EXISTS arrears_interest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS arrears_interest_margin_percent numeric(5,2) NOT NULL DEFAULT 2.00;

-- ─── PART 3: Arrears interest charges (immutable) ───────────

CREATE TABLE arrears_interest_charges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  arrears_case_id       uuid NOT NULL REFERENCES arrears_cases(id),
  lease_id              uuid NOT NULL REFERENCES leases(id),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  charge_date           date NOT NULL,
  principal_cents       integer NOT NULL,
  prime_rate_percent    numeric(5,2) NOT NULL,
  margin_percent        numeric(5,2) NOT NULL,
  effective_rate_percent numeric(5,2) NOT NULL,
  interest_cents        integer NOT NULL,
  waived                boolean NOT NULL DEFAULT false,
  waived_by             uuid REFERENCES auth.users(id),
  waived_at             timestamptz,
  waived_reason         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(arrears_case_id, charge_date)
);

CREATE INDEX idx_interest_charges_case ON arrears_interest_charges(arrears_case_id);
CREATE INDEX idx_interest_charges_date ON arrears_interest_charges(charge_date);
CREATE INDEX idx_interest_charges_org ON arrears_interest_charges(org_id);

ALTER TABLE arrears_interest_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_interest_charges_select" ON arrears_interest_charges
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_interest_charges_insert" ON arrears_interest_charges
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_interest_charges_waive" ON arrears_interest_charges
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE OR REPLACE FUNCTION get_arrears_interest_total(p_case_id uuid)
RETURNS integer AS $$
  SELECT COALESCE(SUM(interest_cents), 0)::integer
  FROM arrears_interest_charges
  WHERE arrears_case_id = p_case_id
  AND waived = false;
$$ LANGUAGE sql STABLE;

-- ─── PART 4: Arrears cases interest summary ─────────────────

ALTER TABLE arrears_cases
  ADD COLUMN IF NOT EXISTS interest_accrued_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_last_calculated_at timestamptz;

CREATE OR REPLACE FUNCTION refresh_arrears_interest_total(p_case_id uuid)
RETURNS void AS $$
  UPDATE arrears_cases SET
    interest_accrued_cents = (
      SELECT COALESCE(SUM(interest_cents), 0)
      FROM arrears_interest_charges
      WHERE arrears_case_id = p_case_id
      AND waived = false
    ),
    interest_last_calculated_at = now()
  WHERE id = p_case_id;
$$ LANGUAGE sql;
