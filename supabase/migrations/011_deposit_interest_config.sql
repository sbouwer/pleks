-- ADDENDUM_17A: Deposit interest rate configuration
-- Hierarchy: org default → property override → unit override (rare)
-- Rate modes: fixed | prime_linked | repo_linked | manual
-- Compounding: daily | monthly

CREATE TABLE deposit_interest_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id),
  property_id UUID REFERENCES properties(id),  -- NULL = org default
  unit_id UUID REFERENCES units(id),            -- NULL = property or org level

  rate_type TEXT NOT NULL CHECK (rate_type IN ('fixed', 'prime_linked', 'repo_linked', 'manual')),

  -- Rate parameters (only one used based on rate_type)
  fixed_rate_percent NUMERIC(6,3),
  prime_offset_percent NUMERIC(6,3),  -- negative = below prime, e.g. -4.75
  repo_offset_percent NUMERIC(6,3),

  compounding TEXT NOT NULL DEFAULT 'monthly' CHECK (compounding IN ('daily', 'monthly')),

  -- Informational bank details
  bank_name TEXT,
  account_reference TEXT,

  -- Effective period — NULL effective_to = currently active
  effective_from DATE NOT NULL,
  effective_to DATE,

  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT no_overlapping_configs UNIQUE (org_id, property_id, unit_id, effective_from)
);

CREATE INDEX idx_dic_org ON deposit_interest_config(org_id);
CREATE INDEX idx_dic_property ON deposit_interest_config(property_id) WHERE property_id IS NOT NULL;

ALTER TABLE deposit_interest_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON deposit_interest_config
  USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

-- Immutable audit log — every config create/end/update recorded
CREATE TABLE deposit_interest_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  config_id UUID NOT NULL REFERENCES deposit_interest_config(id),
  action TEXT NOT NULL CHECK (action IN ('created', 'ended', 'updated')),

  -- Snapshot at time of action
  rate_type TEXT NOT NULL,
  fixed_rate_percent NUMERIC(6,3),
  prime_offset_percent NUMERIC(6,3),
  repo_offset_percent NUMERIC(6,3),
  compounding TEXT NOT NULL,
  bank_name TEXT,
  account_reference TEXT,
  effective_from DATE NOT NULL,
  effective_to DATE,

  changed_by UUID NOT NULL REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason TEXT
);

CREATE INDEX idx_dica_config ON deposit_interest_config_audit(config_id);

-- Rate tracking on deposit_transactions
ALTER TABLE deposit_transactions ADD COLUMN IF NOT EXISTS effective_rate_percent NUMERIC(6,3);
ALTER TABLE deposit_transactions ADD COLUMN IF NOT EXISTS rate_config_id UUID REFERENCES deposit_interest_config(id);
ALTER TABLE deposit_transactions ADD COLUMN IF NOT EXISTS auto_allocated_to_principal BOOLEAN DEFAULT false;
ALTER TABLE deposit_transactions ADD COLUMN IF NOT EXISTS authorisation_type TEXT CHECK (authorisation_type IN ('tenant_request', 'lease_clause', 'agent_decision'));
ALTER TABLE deposit_transactions ADD COLUMN IF NOT EXISTS authorisation_reference TEXT;
ALTER TABLE deposit_transactions ADD COLUMN IF NOT EXISTS linked_payment_id UUID;

-- Updated transaction_type CHECK to include full lifecycle
ALTER TABLE deposit_transactions DROP CONSTRAINT IF EXISTS deposit_transactions_transaction_type_check;
ALTER TABLE deposit_transactions ADD CONSTRAINT deposit_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'deposit_received',
    'deposit_topup',
    'interest_accrued',
    'interest_capitalised',
    'deposit_partial_release',
    'deposit_partial_replenish',
    'deduction_applied',
    'deduction_reversed',
    'deposit_returned_to_tenant',
    'deduction_paid_to_landlord',
    'forfeited'
  ));
