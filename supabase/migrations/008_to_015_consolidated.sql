-- =============================================================================
-- Consolidated migration: 008 → 015
-- Safe to run multiple times (fully idempotent).
-- Individual files 008–015 are kept for reference but this is the authoritative
-- script to apply to a fresh or existing database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 008: Lease creation path fork (ADDENDUM_42A)
-- ---------------------------------------------------------------------------
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS template_source TEXT NOT NULL DEFAULT 'pleks'
  CHECK (template_source IN ('pleks', 'uploaded'));

COMMENT ON COLUMN leases.template_source IS
  'pleks = created via Pleks 7-step wizard; uploaded = user brought own lease document';

-- ---------------------------------------------------------------------------
-- 009a: Maintenance cost split — trust_transactions type (ADDENDUM_06A)
-- ---------------------------------------------------------------------------
ALTER TABLE trust_transactions
  DROP CONSTRAINT IF EXISTS trust_transactions_transaction_type_check;

ALTER TABLE trust_transactions
  ADD CONSTRAINT trust_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'rent_received', 'deposit_received', 'deposit_interest',
    'expense_paid', 'management_fee', 'owner_payment',
    'deposit_returned', 'deposit_deduction', 'adjustment',
    'maintenance_expense'
  ));

ALTER TABLE trust_transactions
  ADD COLUMN IF NOT EXISTS maintenance_request_id uuid REFERENCES maintenance_requests(id);

-- ---------------------------------------------------------------------------
-- 009b: Maintenance cost allocations table (ADDENDUM_06A)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_cost_allocations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES organisations(id),
  request_id                uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,

  allocation_type           text NOT NULL CHECK (allocation_type IN (
                              'landlord_expense',
                              'tenant_charge',
                              'insurance_claim',
                              'hoa_levy'
                            )),

  amount_cents              int NOT NULL,
  description               text NOT NULL,
  lease_clause_ref          text,

  collection_method         text CHECK (collection_method IN (
                              'next_invoice',
                              'separate_invoice',
                              'deposit_deduction',
                              'already_paid'
                            )),

  invoice_id                uuid,
  added_to_invoice_at       timestamptz,
  deposit_deduction_item_id uuid,

  created_by                uuid NOT NULL REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE maintenance_cost_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON maintenance_cost_allocations;
CREATE POLICY "org_isolation" ON maintenance_cost_allocations
  USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE INDEX IF NOT EXISTS idx_maint_alloc_request ON maintenance_cost_allocations(request_id);
CREATE INDEX IF NOT EXISTS idx_maint_alloc_org     ON maintenance_cost_allocations(org_id);

-- ---------------------------------------------------------------------------
-- 010: Payment reference on rent_invoices (ADDENDUM_07A)
-- ---------------------------------------------------------------------------
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS idx_rent_invoices_payment_ref
  ON rent_invoices(payment_reference)
  WHERE payment_reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 011a: Deposit interest config table (ADDENDUM_17A)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_interest_config (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organisations(id),
  property_id          uuid        REFERENCES properties(id),
  unit_id              uuid        REFERENCES units(id),

  rate_type            text        NOT NULL CHECK (rate_type IN ('fixed', 'prime_linked', 'repo_linked', 'manual')),

  fixed_rate_percent   numeric(6,3),
  prime_offset_percent numeric(6,3),
  repo_offset_percent  numeric(6,3),

  compounding          text        NOT NULL DEFAULT 'monthly' CHECK (compounding IN ('daily', 'monthly')),

  bank_name            text,
  account_reference    text,

  effective_from       date        NOT NULL,
  effective_to         date,

  created_by           uuid        NOT NULL REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT no_overlapping_configs UNIQUE (org_id, property_id, unit_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_dic_org      ON deposit_interest_config(org_id);
CREATE INDEX IF NOT EXISTS idx_dic_property ON deposit_interest_config(property_id) WHERE property_id IS NOT NULL;

ALTER TABLE deposit_interest_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON deposit_interest_config;
CREATE POLICY "org_isolation" ON deposit_interest_config
  USING (org_id = (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1
  ));

-- ---------------------------------------------------------------------------
-- 011b: Deposit interest config audit table (ADDENDUM_17A)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_interest_config_audit (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL,
  config_id            uuid        NOT NULL REFERENCES deposit_interest_config(id),
  action               text        NOT NULL CHECK (action IN ('created', 'ended', 'updated')),

  rate_type            text        NOT NULL,
  fixed_rate_percent   numeric(6,3),
  prime_offset_percent numeric(6,3),
  repo_offset_percent  numeric(6,3),
  compounding          text        NOT NULL,
  bank_name            text,
  account_reference    text,
  effective_from       date        NOT NULL,
  effective_to         date,

  changed_by           uuid        NOT NULL REFERENCES auth.users(id),
  changed_at           timestamptz NOT NULL DEFAULT now(),
  change_reason        text
);

CREATE INDEX IF NOT EXISTS idx_dica_config ON deposit_interest_config_audit(config_id);

-- ---------------------------------------------------------------------------
-- 011c: deposit_transactions columns & type constraint (ADDENDUM_17A)
-- ---------------------------------------------------------------------------
ALTER TABLE deposit_transactions
  ADD COLUMN IF NOT EXISTS effective_rate_percent       numeric(6,3),
  ADD COLUMN IF NOT EXISTS rate_config_id               uuid REFERENCES deposit_interest_config(id),
  ADD COLUMN IF NOT EXISTS auto_allocated_to_principal  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS authorisation_type           text    CHECK (authorisation_type IN ('tenant_request', 'lease_clause', 'agent_decision')),
  ADD COLUMN IF NOT EXISTS authorisation_reference      text,
  ADD COLUMN IF NOT EXISTS linked_payment_id            uuid;

ALTER TABLE deposit_transactions
  DROP CONSTRAINT IF EXISTS deposit_transactions_transaction_type_check;

ALTER TABLE deposit_transactions
  ADD CONSTRAINT deposit_transactions_transaction_type_check
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

-- ---------------------------------------------------------------------------
-- 012: floor_area_m2 on units (ADDENDUM_18A)
-- ---------------------------------------------------------------------------
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS floor_area_m2 numeric(8,2);

COMMENT ON COLUMN units.floor_area_m2 IS
  'Net floor area in m² used for HOA levy calculations (floor_area_m2 method). '
  'Distinct from size_m2 which is gross unit size.';

-- ---------------------------------------------------------------------------
-- 013: maintenance_recovery charge type on lease_charges (ADDENDUM_06A)
-- ---------------------------------------------------------------------------
ALTER TABLE lease_charges
  DROP CONSTRAINT IF EXISTS lease_charges_charge_type_check;

ALTER TABLE lease_charges
  ADD CONSTRAINT lease_charges_charge_type_check
  CHECK (charge_type IN (
    'body_corporate_levy', 'special_levy', 'parking',
    'water_flat_rate', 'electricity_flat_rate',
    'garden_service', 'security', 'internet',
    'maintenance_recovery', 'other'
  ));

COMMENT ON COLUMN lease_charges.charge_type IS
  'maintenance_recovery = charge created via maintenance sign-off cost split';

-- ---------------------------------------------------------------------------
-- 014: Org-level notification settings (ADDENDUM_48A §9)
-- ---------------------------------------------------------------------------
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT '{
    "email_from_name": null,
    "reply_to_email": null,
    "email_applications": true,
    "email_maintenance": true,
    "email_arrears": true,
    "email_inspections": true,
    "email_lease": true,
    "email_statements": true,
    "sms_enabled": false,
    "sms_maintenance": true,
    "sms_arrears": false,
    "sms_inspections": true
  }'::jsonb;

COMMENT ON COLUMN organisations.notification_settings IS
  'Org-level defaults for which email/SMS categories are enabled. '
  'Per-contact opt-outs are in communication_preferences.';

-- ---------------------------------------------------------------------------
-- 015: Org-level lease branding columns (BUILD_32)
-- ---------------------------------------------------------------------------
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS lease_logo_path            text,
  ADD COLUMN IF NOT EXISTS lease_display_name         text,
  ADD COLUMN IF NOT EXISTS lease_registration_number  text,
  ADD COLUMN IF NOT EXISTS lease_address              text,
  ADD COLUMN IF NOT EXISTS lease_phone                text,
  ADD COLUMN IF NOT EXISTS lease_email                text,
  ADD COLUMN IF NOT EXISTS lease_website              text,
  ADD COLUMN IF NOT EXISTS lease_accent_color         text;

COMMENT ON COLUMN organisations.lease_logo_path           IS 'Storage path to org logo used on generated leases';
COMMENT ON COLUMN organisations.lease_display_name        IS 'Trading name shown on lease cover page (falls back to name)';
COMMENT ON COLUMN organisations.lease_registration_number IS 'EAAB / company reg number shown on lease cover page';
COMMENT ON COLUMN organisations.lease_accent_color        IS 'Hex accent colour for divider lines on generated lease PDF';
