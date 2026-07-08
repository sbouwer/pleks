-- 004_leases_financials.sql
-- Consolidated migration 4 of 6: Leases + Financials
--
-- Sources (leases): 007, 015, 029, 032, 034, 036, 040, 046
-- Sources (financials): 010, 011, 012, 013, 014, 020, 023, 031, 042, 047


-- =============================================================================
-- TABLES
-- =============================================================================

-- ─── Lease-related tables ────────────────────────────────────────────────────

-- NOTE: property_rules table is defined in 018_property_rules.sql (template-based system).
-- The old flat schema was replaced in BUILD_44.

-- Lease templates (core document versions)
CREATE TABLE IF NOT EXISTS lease_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid,
  template_type   text NOT NULL CHECK (template_type IN ('residential', 'commercial')),
  version         text NOT NULL,
  name            text NOT NULL,
  docuseal_template_id text,
  is_active       boolean DEFAULT true,
  is_system       boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Leases (merged from 007 + 015 + 029 + 032 + 036 + 040)
CREATE TABLE IF NOT EXISTS leases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  unit_id             uuid NOT NULL REFERENCES units(id),
  property_id         uuid NOT NULL REFERENCES properties(id),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  landlord_id         uuid,
  lease_type          text NOT NULL DEFAULT 'residential'
                      CHECK (lease_type IN ('residential', 'commercial')),
  tenant_is_juristic  boolean NOT NULL DEFAULT false,
  cpa_applies         boolean NOT NULL DEFAULT true,
  -- Addendum A
  start_date          date NOT NULL,
  end_date            date,
  is_fixed_term       boolean NOT NULL DEFAULT true,
  notice_period_days  integer NOT NULL DEFAULT 20,
  -- Addendum B
  rent_amount_cents   integer NOT NULL,
  payment_due_day     integer NOT NULL DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 28),
  escalation_percent  numeric(5,2) NOT NULL DEFAULT 10.00,
  escalation_type     text NOT NULL DEFAULT 'fixed'
                      CHECK (escalation_type IN ('fixed', 'cpi', 'prime_plus')),
  escalation_review_date date,
  deposit_amount_cents integer,
  deposit_interest_to text NOT NULL DEFAULT 'tenant'
                      CHECK (deposit_interest_to IN ('tenant', 'landlord')),
  -- Addendum D
  special_terms       jsonb DEFAULT '[]',
  -- Document assembly
  core_template_id    uuid REFERENCES lease_templates(id),
  docuseal_submission_id text,
  docuseal_document_url text,
  -- Status
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN (
                        'draft', 'pending_signing', 'active', 'notice',
                        'expired', 'cancelled', 'month_to_month'
                      )),
  -- Notice
  notice_given_by     text CHECK (notice_given_by IN ('tenant', 'landlord')),
  notice_given_date   date,
  notice_period_end   date,
  -- CPA
  auto_renewal_notice_sent_at timestamptz,
  auto_renewal_notice_due     date,
  -- Deposit return (from 015)
  deposit_return_days integer DEFAULT 30,
  -- Interest settings (from 029)
  deposit_interest_rate_percent numeric(5,2),
  deposit_interest_last_accrued_date date,
  arrears_interest_enabled boolean NOT NULL DEFAULT true,
  arrears_interest_margin_percent numeric(5,2) NOT NULL DEFAULT 2.00,
  -- Clause system (from 032)
  template_type       text CHECK (template_type IN (
                        'pleks_residential', 'pleks_commercial', 'custom'
                      )),
  generated_doc_path  text,
  clause_snapshot     jsonb,
  -- Migrated lease support (from 036)
  external_document_path text,
  migrated            boolean NOT NULL DEFAULT false,
  -- Notes (from 040)
  notes               text,
  -- Meta
  created_by          uuid REFERENCES auth.users(id),
  signed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- Lease amendments
CREATE TABLE IF NOT EXISTS lease_amendments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  amendment_type  text NOT NULL CHECK (amendment_type IN (
                    'rent_escalation', 'deposit_top_up', 'special_term_change',
                    'term_extension', 'early_termination', 'other'
                  )),
  previous_values jsonb,
  new_values      jsonb,
  effective_date  date NOT NULL,
  requires_signature boolean NOT NULL DEFAULT true,
  docuseal_submission_id text,
  docuseal_document_url  text,
  signed_at       timestamptz,
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Lease lifecycle events (immutable)
CREATE TABLE IF NOT EXISTS lease_lifecycle_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  lease_id        uuid NOT NULL REFERENCES leases(id),
  event_type      text NOT NULL CHECK (event_type IN (
                    'lease_created', 'lease_signed', 'cpa_notice_sent',
                    'renewal_offer_sent', 'renewal_accepted', 'renewal_declined',
                    'escalation_processed', 'escalation_amendment_signed',
                    'notice_given_tenant', 'notice_given_landlord',
                    'converted_to_month_to_month', 'deposit_timer_started',
                    'lease_expired', 'lease_renewed', 'lease_cancelled'
                  )),
  description     text,
  metadata        jsonb DEFAULT '{}',
  triggered_by    text CHECK (triggered_by IN ('system', 'agent', 'tenant', 'cron')),
  triggered_by_user uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Lease renewal offers
CREATE TABLE IF NOT EXISTS lease_renewal_offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  lease_id        uuid NOT NULL REFERENCES leases(id),
  proposed_start_date   date NOT NULL,
  proposed_end_date     date,
  proposed_rent_cents   integer NOT NULL,
  proposed_escalation_percent numeric(5,2),
  proposed_deposit_cents integer,
  notes                 text,
  status          text NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  expires_at      timestamptz,
  ai_drafted      boolean DEFAULT false,
  responded_at    timestamptz,
  response_notes  text,
  new_lease_id    uuid REFERENCES leases(id),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Lease clause library (platform-level, read-only)
CREATE TABLE IF NOT EXISTS lease_clause_library (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_key            text NOT NULL UNIQUE,
  title                 text NOT NULL,
  body_template         text NOT NULL,
  lease_type            text NOT NULL DEFAULT 'both'
    CHECK (lease_type IN ('residential', 'commercial', 'both')),
  is_required           boolean NOT NULL DEFAULT false,
  is_enabled_by_default boolean NOT NULL DEFAULT true,
  depends_on            text[] DEFAULT '{}',
  sort_order            integer NOT NULL,
  description           text,
  toggle_label          text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Org clause defaults
CREATE TABLE IF NOT EXISTS org_lease_clause_defaults (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  clause_key  text NOT NULL
    REFERENCES lease_clause_library(clause_key),
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, clause_key)
);

-- Per-lease clause selections (lease_id nullable per 034; unique index per 034)
CREATE TABLE IF NOT EXISTS lease_clause_selections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  lease_id    uuid REFERENCES leases(id),
  clause_key  text NOT NULL
    REFERENCES lease_clause_library(clause_key),
  enabled     boolean NOT NULL DEFAULT true,
  custom_body text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Lease charges — recurring additional charges on leases (from 046)
CREATE TABLE IF NOT EXISTS lease_charges (
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
  payable_to_supplier_id uuid,    -- FK to contractors/suppliers added after 005
  deduct_from_owner_payment boolean NOT NULL DEFAULT false,
  vat_applicable  boolean NOT NULL DEFAULT false,
  vat_rate_percent numeric(5,2) DEFAULT 15.00,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Prime rates (from 029)
CREATE TABLE IF NOT EXISTS prime_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_percent   numeric(5,2) NOT NULL,
  effective_date date NOT NULL,
  mpc_meeting_date date,
  notes          text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed: initial prime rate
INSERT INTO prime_rates (rate_percent, effective_date, notes)
VALUES (11.25, '2024-01-01', 'Seed rate — update with actual effective date');

-- ─── Financial tables ────────────────────────────────────────────────────────

-- Extend organisations with management fee settings (from 010)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_percent numeric(5,2) DEFAULT 10.00;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_type text DEFAULT 'percent'
  CHECK (management_fee_type IN ('percent', 'fixed'));
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_fixed_cents integer;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS management_fee_vat_applicable boolean DEFAULT false;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS deposit_interest_rate_percent numeric(5,2) DEFAULT 5.00;

-- Trust ledger (immutable — NO update/delete) (merged from 010 + 023)
CREATE TABLE IF NOT EXISTS trust_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid REFERENCES properties(id),
  unit_id         uuid REFERENCES units(id),
  lease_id        uuid REFERENCES leases(id),
  owner_ref       text,
  transaction_type text NOT NULL CHECK (transaction_type IN (
                    'rent_received', 'deposit_received', 'deposit_interest',
                    'expense_paid', 'management_fee', 'owner_payment',
                    'deposit_returned', 'deposit_deduction', 'adjustment'
                  )),
  direction       text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  reference       text,
  invoice_id      uuid,
  supplier_invoice_id uuid,  -- plain uuid, FK added in 005 after supplier_invoices table
  statement_month date,
  -- Opening balance flag (from 023)
  is_opening_balance boolean DEFAULT false,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Rent invoices (merged from 010 + 047)
CREATE TABLE IF NOT EXISTS rent_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  unit_id         uuid NOT NULL REFERENCES units(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  invoice_number  text UNIQUE NOT NULL,
  invoice_date    date NOT NULL,
  due_date        date NOT NULL,
  period_from     date NOT NULL,
  period_to       date NOT NULL,
  rent_amount_cents    integer NOT NULL,
  other_charges_cents  integer DEFAULT 0,
  total_amount_cents   integer NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'partial', 'paid', 'overdue', 'cancelled', 'credit')),
  amount_paid_cents    integer DEFAULT 0,
  balance_cents        integer,
  paid_at              timestamptz,
  receipt_sent_at      timestamptz,
  receipt_storage_path text,
  notes                text,
  -- Charges breakdown (from 047)
  charges_breakdown    jsonb DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Payments (merged from 010 + 031)
CREATE TABLE IF NOT EXISTS payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  invoice_id      uuid REFERENCES rent_invoices(id),
  lease_id        uuid REFERENCES leases(id),
  tenant_id       uuid REFERENCES tenants(id),
  amount_cents    integer NOT NULL,
  payment_date    date NOT NULL,
  payment_method  text NOT NULL CHECK (payment_method IN (
                    'eft', 'cash', 'card', 'bank_recon_matched'
                  )),
  reference       text,
  allocated_invoices jsonb DEFAULT '[]',
  surplus_cents   integer DEFAULT 0,
  surplus_disposition text CHECK (surplus_disposition IN (
                    'credit_next_month', 'refund_to_tenant', 'pending'
                  )),
  bank_statement_line_id uuid,
  recon_method    text CHECK (recon_method IN ('manual', 'exact_match', 'fuzzy_match', 'ai_match')),
  receipt_number  text,
  receipt_sent_at timestamptz,
  recorded_by     uuid REFERENCES auth.users(id),
  notes           text,
  -- Interest allocation (from 031)
  interest_applied_cents integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Management fee invoices
CREATE TABLE IF NOT EXISTS management_fee_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid REFERENCES properties(id),
  period_month    date NOT NULL,
  gross_rent_collected_cents integer NOT NULL,
  fee_percent     numeric(5,2),
  fee_amount_cents integer NOT NULL,
  vat_amount_cents integer DEFAULT 0,
  total_cents     integer NOT NULL,
  status          text NOT NULL DEFAULT 'generated'
                  CHECK (status IN ('generated', 'deducted', 'invoiced_to_owner', 'paid')),
  deducted_at     timestamptz,
  invoice_number  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Property annual summaries (SARS ITR12 aligned)
CREATE TABLE IF NOT EXISTS property_annual_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid NOT NULL REFERENCES properties(id),
  tax_year_start  date NOT NULL,
  tax_year_end    date NOT NULL,
  gross_rental_income_cents     integer DEFAULT 0,
  deduction_bond_interest_cents      integer DEFAULT 0,
  deduction_rates_taxes_cents        integer DEFAULT 0,
  deduction_insurance_cents          integer DEFAULT 0,
  deduction_repairs_maintenance_cents integer DEFAULT 0,
  deduction_management_fees_cents    integer DEFAULT 0,
  deduction_garden_services_cents    integer DEFAULT 0,
  deduction_security_cents           integer DEFAULT 0,
  deduction_advertising_cents        integer DEFAULT 0,
  deduction_levies_cents             integer DEFAULT 0,
  deduction_other_cents              integer DEFAULT 0,
  total_deductions_cents             integer DEFAULT 0,
  net_taxable_rental_income_cents    integer DEFAULT 0,
  capital_improvements_cents         integer DEFAULT 0,
  is_provisional_taxpayer_threshold_exceeded boolean DEFAULT false,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now()
);

-- Owner statements (from 011 — table only, ALTER properties went into 003)
CREATE TABLE IF NOT EXISTS owner_statements (
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

-- Deposit timers (from 020)
CREATE TABLE IF NOT EXISTS deposit_timers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  inspection_id   uuid REFERENCES inspections(id),
  return_days     integer NOT NULL,
  deadline        date NOT NULL,
  timer_reason    text,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','overdue','disputed')),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Deposit deduction items (from 020)
CREATE TABLE IF NOT EXISTS deposit_deduction_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  lease_id          uuid NOT NULL REFERENCES leases(id),
  inspection_id     uuid REFERENCES inspections(id),
  inspection_item_id uuid,
  room              text,
  item_description  text NOT NULL,
  classification    text NOT NULL CHECK (classification IN (
                      'tenant_damage',
                      'wear_and_tear',
                      'pre_existing',
                      'disputed'
                    )),
  move_in_photo_path   text,
  move_out_photo_path  text,
  deduction_amount_cents  integer DEFAULT 0,
  ai_justification        text,
  ai_justification_at     timestamptz,
  ai_model                text,
  quote_amount_cents      integer,
  quote_storage_path      text,
  invoice_amount_cents    integer,
  invoice_storage_path    text,
  agent_confirmed         boolean DEFAULT false,
  confirmed_by            uuid REFERENCES auth.users(id),
  confirmed_at            timestamptz,
  tenant_disputed         boolean DEFAULT false,
  dispute_notes           text,
  dispute_resolved        boolean DEFAULT false,
  dispute_resolution      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Deposit transactions (from 020 — immutable)
CREATE TABLE IF NOT EXISTS deposit_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  transaction_type text NOT NULL CHECK (transaction_type IN (
                    'deposit_received',
                    'interest_accrued',
                    'deduction_applied',
                    'deduction_reversed',
                    'deposit_returned_to_tenant',
                    'deduction_paid_to_landlord',
                    'forfeited'
                  )),
  direction       text NOT NULL CHECK (direction IN ('credit','debit')),
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  reference       text,
  deduction_item_id uuid REFERENCES deposit_deduction_items(id),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
  -- NO update/delete — immutable
);

-- Deposit reconciliations (from 020 — one per lease at lease end)
CREATE TABLE IF NOT EXISTS deposit_reconciliations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  lease_id          uuid NOT NULL UNIQUE REFERENCES leases(id),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  inspection_id     uuid REFERENCES inspections(id),
  deposit_held_cents          integer NOT NULL,
  interest_accrued_cents      integer NOT NULL DEFAULT 0,
  total_available_cents       integer NOT NULL,
  total_deductions_cents      integer NOT NULL DEFAULT 0,
  deduction_items_count       integer NOT NULL DEFAULT 0,
  refund_to_tenant_cents      integer NOT NULL,
  deductions_to_landlord_cents integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                      'draft',
                      'pending_review',
                      'sent_to_tenant',
                      'disputed',
                      'finalised',
                      'refunded',
                      'overdue'
                    )),
  schedule_sent_at        timestamptz,
  schedule_pdf_path       text,
  schedule_sent_to        text,
  tenant_refund_paid_at   timestamptz,
  tenant_refund_reference text,
  landlord_payment_paid_at timestamptz,
  landlord_payment_reference text,
  tribunal_submission_path text,
  tribunal_submitted_at    timestamptz,
  is_forfeited            boolean DEFAULT false,
  forfeiture_reason       text,
  sars_taxable_flagged    boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Arrears cases (merged from 014 + 029)
CREATE TABLE IF NOT EXISTS arrears_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  lease_id          uuid NOT NULL REFERENCES leases(id),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  unit_id           uuid NOT NULL REFERENCES units(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  lease_type        text NOT NULL DEFAULT 'residential',
  total_arrears_cents       integer NOT NULL DEFAULT 0,
  oldest_outstanding_date   date,
  months_in_arrears         integer DEFAULT 0,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN (
                      'open', 'payment_arrangement', 'legal', 'tribunal',
                      'eviction_notice', 'resolved', 'written_off', 'vacated_with_debt'
                    )),
  current_step      integer DEFAULT 0,
  sequence_id       uuid,
  sequence_paused   boolean DEFAULT false,
  sequence_paused_reason text,
  arrangement_amount_cents    integer,
  arrangement_start_date      date,
  arrangement_end_date        date,
  arrangement_notes           text,
  referred_to_attorney        boolean DEFAULT false,
  referred_at                 timestamptz,
  attorney_name               text,
  attorney_reference          text,
  tpn_listed                  boolean DEFAULT false,
  tpn_listed_at               timestamptz,
  tpn_listing_reference       text,
  tpn_removed_at              timestamptz,
  rha_s4_notice_sent          boolean DEFAULT false,
  rha_s4_notice_sent_at       timestamptz,
  resolved_at                 timestamptz,
  resolved_by                 uuid REFERENCES auth.users(id),
  resolution_notes            text,
  -- Interest summary (from 029)
  interest_accrued_cents      integer NOT NULL DEFAULT 0,
  interest_last_calculated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Arrears sequences (configurable per org)
CREATE TABLE IF NOT EXISTS arrears_sequences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  name            text NOT NULL DEFAULT 'Default Sequence',
  lease_type      text NOT NULL DEFAULT 'residential',
  is_default      boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Arrears sequence steps
CREATE TABLE IF NOT EXISTS arrears_sequence_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  sequence_id     uuid NOT NULL REFERENCES arrears_sequences(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  trigger_days    integer NOT NULL,
  action_type     text NOT NULL CHECK (action_type IN (
                    'sms', 'email', 'whatsapp', 'formal_email',
                    'letter_of_demand', 'pre_legal_notice', 'agent_task'
                  )),
  tone            text NOT NULL DEFAULT 'friendly'
                  CHECK (tone IN ('friendly', 'firm', 'formal', 'legal')),
  ai_draft        boolean DEFAULT true,
  template_override text,
  requires_agent_approval boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Arrears actions log (immutable)
CREATE TABLE IF NOT EXISTS arrears_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  case_id         uuid NOT NULL REFERENCES arrears_cases(id),
  step_number     integer,
  action_type     text NOT NULL,
  channel         text,
  subject         text,
  body            text,
  ai_drafted      boolean DEFAULT false,
  ai_model        text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  delivery_status text,
  external_ref    text,
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  tenant_responded      boolean DEFAULT false,
  tenant_response_notes text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Arrears interest charges (immutable, from 029)
CREATE TABLE IF NOT EXISTS arrears_interest_charges (
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

-- Bank statement imports (from 012)
CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  bank_account_id   uuid NOT NULL,  -- plain uuid, FK to bank_accounts in 001
  original_filename  text NOT NULL,
  storage_path       text NOT NULL,
  file_size_bytes    integer,
  mime_type          text DEFAULT 'application/pdf',
  detected_bank      text CHECK (detected_bank IN (
                       'fnb', 'absa', 'standard_bank', 'nedbank',
                       'capitec', 'investec', 'other'
                     )),
  statement_period_from date,
  statement_period_to   date,
  statement_account_number text,
  opening_balance_cents   integer,
  closing_balance_cents   integer,
  extraction_status  text NOT NULL DEFAULT 'pending'
                     CHECK (extraction_status IN (
                       'pending', 'extracting', 'extracted',
                       'matching', 'complete', 'failed'
                     )),
  extracted_at       timestamptz,
  matched_at         timestamptz,
  transaction_count  integer DEFAULT 0,
  matched_count      integer DEFAULT 0,
  unmatched_count    integer DEFAULT 0,
  reconciled         boolean DEFAULT false,
  reconciled_by      uuid REFERENCES auth.users(id),
  reconciled_at      timestamptz,
  recon_notes        text,
  pleks_calculated_closing_cents integer,
  balance_discrepancy_cents      integer,
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Bank statement lines (from 012)
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  import_id         uuid NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  transaction_date  date NOT NULL,
  description_raw   text NOT NULL,
  reference_raw     text,
  debit_cents       integer DEFAULT 0,
  credit_cents      integer DEFAULT 0,
  balance_cents     integer,
  description_clean text,
  reference_clean   text,
  amount_cents      integer NOT NULL,
  direction         text NOT NULL CHECK (direction IN ('credit', 'debit')),
  match_status      text NOT NULL DEFAULT 'unmatched'
                    CHECK (match_status IN (
                      'matched_exact', 'matched_fuzzy', 'matched_ai',
                      'matched_manual', 'unmatched', 'ignored', 'split'
                    )),
  match_confidence  numeric(3,2),
  matched_invoice_id       uuid REFERENCES rent_invoices(id),
  matched_payment_id       uuid REFERENCES payments(id),
  matched_supplier_inv_id  uuid,
  matched_trust_txn_id     uuid REFERENCES trust_transactions(id),
  ai_match_suggestion      jsonb,
  ai_match_confirmed       boolean DEFAULT false,
  ai_match_confirmed_by    uuid REFERENCES auth.users(id),
  resolved_by              uuid REFERENCES auth.users(id),
  resolved_at              timestamptz,
  ignore_reason            text,
  line_sequence            integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Tenant bank accounts (merged from 013 + 042)
CREATE TABLE IF NOT EXISTS tenant_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  bank_name       text NOT NULL,
  account_holder  text NOT NULL,
  account_number  text NOT NULL,
  branch_code     text,
  account_type    text CHECK (account_type IN ('current', 'savings', 'transmission')),
  -- Encryption fields (from 042)
  account_number_enc text,
  account_number_hash text,
  purpose         text NOT NULL DEFAULT 'general',
  source          text NOT NULL DEFAULT 'manual',
  imported_from   text,
  verified        boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  consent_given   boolean NOT NULL DEFAULT false,
  consent_given_at timestamptz,
  is_primary      boolean NOT NULL DEFAULT true,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- INDEXES
-- =============================================================================

-- Leases
CREATE INDEX IF NOT EXISTS idx_leases_org_id ON leases(org_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit_id ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);
CREATE INDEX IF NOT EXISTS idx_leases_end_date ON leases(end_date);

-- Lease amendments
CREATE INDEX IF NOT EXISTS idx_lease_amendments_lease_id ON lease_amendments(lease_id);

-- Lease lifecycle events
CREATE INDEX IF NOT EXISTS idx_lifecycle_lease ON lease_lifecycle_events(lease_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_org ON lease_lifecycle_events(org_id);

-- Lease clause selections (unique index from 034 — handles nullable lease_id)
CREATE UNIQUE INDEX IF NOT EXISTS lease_clause_selections_unique
  ON lease_clause_selections (
    org_id, clause_key,
    COALESCE(lease_id, '00000000-0000-0000-0000-000000000000')
  );

-- Lease charges
CREATE INDEX IF NOT EXISTS idx_lease_charges_lease ON lease_charges(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_charges_org ON lease_charges(org_id);
CREATE INDEX IF NOT EXISTS idx_lease_charges_active ON lease_charges(lease_id, is_active) WHERE is_active = true;

-- Trust transactions
CREATE INDEX IF NOT EXISTS idx_trust_tx_org ON trust_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_trust_tx_property ON trust_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_trust_tx_statement_month ON trust_transactions(statement_month);
CREATE INDEX IF NOT EXISTS idx_trust_txn_opening_balance ON trust_transactions(is_opening_balance) WHERE is_opening_balance = true;

-- Rent invoices
CREATE INDEX IF NOT EXISTS idx_rent_invoices_org ON rent_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_rent_invoices_lease ON rent_invoices(lease_id);
CREATE INDEX IF NOT EXISTS idx_rent_invoices_due_date ON rent_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_rent_invoices_status ON rent_invoices(status);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_lease ON payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);

-- Owner statements
CREATE INDEX IF NOT EXISTS idx_owner_statements_org      ON owner_statements(org_id);
CREATE INDEX IF NOT EXISTS idx_owner_statements_property ON owner_statements(property_id);
CREATE INDEX IF NOT EXISTS idx_owner_statements_period   ON owner_statements(period_month);
CREATE INDEX IF NOT EXISTS idx_owner_statements_token    ON owner_statements(portal_token);

-- Deposit recon
CREATE INDEX IF NOT EXISTS idx_deposit_timers_lease ON deposit_timers(lease_id);
CREATE INDEX IF NOT EXISTS idx_deposit_timers_status ON deposit_timers(status) WHERE status IN ('running', 'overdue');
CREATE INDEX IF NOT EXISTS idx_deduction_items_lease ON deposit_deduction_items(lease_id);
CREATE INDEX IF NOT EXISTS idx_deposit_txns_lease ON deposit_transactions(lease_id);

-- Arrears
CREATE INDEX IF NOT EXISTS idx_arrears_org ON arrears_cases(org_id);
CREATE INDEX IF NOT EXISTS idx_arrears_lease ON arrears_cases(lease_id);
CREATE INDEX IF NOT EXISTS idx_arrears_status ON arrears_cases(status);
CREATE INDEX IF NOT EXISTS idx_arrears_tenant ON arrears_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arrears_actions_case ON arrears_actions(case_id);

-- Arrears interest charges
CREATE INDEX IF NOT EXISTS idx_interest_charges_case ON arrears_interest_charges(arrears_case_id);
CREATE INDEX IF NOT EXISTS idx_interest_charges_date ON arrears_interest_charges(charge_date);
CREATE INDEX IF NOT EXISTS idx_interest_charges_org ON arrears_interest_charges(org_id);

-- Bank recon
CREATE INDEX IF NOT EXISTS idx_bank_imports_org ON bank_statement_imports(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_imports_account ON bank_statement_imports(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_import ON bank_statement_lines(import_id);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_match_status ON bank_statement_lines(match_status);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_date ON bank_statement_lines(transaction_date);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_reference ON bank_statement_lines(reference_clean);

-- Tenant bank accounts
CREATE INDEX IF NOT EXISTS idx_tenant_bank_accounts_hash ON tenant_bank_accounts(account_number_hash)
  WHERE account_number_hash IS NOT NULL;


-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Lease templates
ALTER TABLE lease_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_templates" ON lease_templates;
CREATE POLICY "org_lease_templates" ON lease_templates
  FOR ALL USING (
    org_id IS NULL OR org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Leases
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_leases" ON leases;
CREATE POLICY "org_leases" ON leases
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_lease" ON leases;
CREATE POLICY "tenant_own_lease" ON leases
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = (SELECT auth.uid()))
    AND status IN ('active', 'notice', 'month_to_month')
  );

-- Lease amendments
ALTER TABLE lease_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_amendments" ON lease_amendments;
CREATE POLICY "org_lease_amendments" ON lease_amendments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Lease lifecycle events
ALTER TABLE lease_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lifecycle_events_select" ON lease_lifecycle_events;
CREATE POLICY "org_lifecycle_events_select" ON lease_lifecycle_events
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_lifecycle_events_insert" ON lease_lifecycle_events;
CREATE POLICY "org_lifecycle_events_insert" ON lease_lifecycle_events
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Lease renewal offers
ALTER TABLE lease_renewal_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_renewal_offers" ON lease_renewal_offers;
CREATE POLICY "org_renewal_offers" ON lease_renewal_offers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Org lease clause defaults
ALTER TABLE org_lease_clause_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_clause_defaults" ON org_lease_clause_defaults;
CREATE POLICY "org_clause_defaults" ON org_lease_clause_defaults
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Lease clause selections
ALTER TABLE lease_clause_selections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_selections" ON lease_clause_selections;
CREATE POLICY "org_lease_selections" ON lease_clause_selections
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Lease charges
ALTER TABLE lease_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_charges" ON lease_charges;
CREATE POLICY "org_lease_charges" ON lease_charges
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Trust transactions
ALTER TABLE trust_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_trust_tx_select" ON trust_transactions;
CREATE POLICY "org_trust_tx_select" ON trust_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_trust_tx_insert" ON trust_transactions;
CREATE POLICY "org_trust_tx_insert" ON trust_transactions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Rent invoices
ALTER TABLE rent_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_rent_invoices" ON rent_invoices;
CREATE POLICY "org_rent_invoices" ON rent_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_invoices" ON rent_invoices;
CREATE POLICY "tenant_own_invoices" ON rent_invoices
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = (SELECT auth.uid()))
  );

-- Payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_payments" ON payments;
CREATE POLICY "org_payments" ON payments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_payments" ON payments;
CREATE POLICY "tenant_own_payments" ON payments
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = (SELECT auth.uid()))
  );

-- Management fee invoices
ALTER TABLE management_fee_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_mgmt_fee_invoices" ON management_fee_invoices;
CREATE POLICY "org_mgmt_fee_invoices" ON management_fee_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Property annual summaries
ALTER TABLE property_annual_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_annual_summaries" ON property_annual_summaries;
CREATE POLICY "org_annual_summaries" ON property_annual_summaries
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Owner statements
ALTER TABLE owner_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_owner_statements" ON owner_statements;
CREATE POLICY "org_owner_statements" ON owner_statements
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Deposit timers
ALTER TABLE deposit_timers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deposit_timers" ON deposit_timers;
CREATE POLICY "org_deposit_timers" ON deposit_timers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Deposit deduction items
ALTER TABLE deposit_deduction_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deduction_items" ON deposit_deduction_items;
CREATE POLICY "org_deduction_items" ON deposit_deduction_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Deposit transactions
ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deposit_txns_select" ON deposit_transactions;
CREATE POLICY "org_deposit_txns_select" ON deposit_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_deposit_txns_insert" ON deposit_transactions;
CREATE POLICY "org_deposit_txns_insert" ON deposit_transactions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Deposit reconciliations
ALTER TABLE deposit_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deposit_recons" ON deposit_reconciliations;
CREATE POLICY "org_deposit_recons" ON deposit_reconciliations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Arrears cases
ALTER TABLE arrears_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears" ON arrears_cases;
CREATE POLICY "org_arrears" ON arrears_cases
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Arrears sequences
ALTER TABLE arrears_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears_sequences" ON arrears_sequences;
CREATE POLICY "org_arrears_sequences" ON arrears_sequences
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Arrears sequence steps
ALTER TABLE arrears_sequence_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears_steps" ON arrears_sequence_steps;
CREATE POLICY "org_arrears_steps" ON arrears_sequence_steps
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Arrears actions
ALTER TABLE arrears_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears_actions_read" ON arrears_actions;
CREATE POLICY "org_arrears_actions_read" ON arrears_actions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_arrears_actions_insert" ON arrears_actions;
CREATE POLICY "org_arrears_actions_insert" ON arrears_actions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Arrears interest charges
ALTER TABLE arrears_interest_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_interest_charges_select" ON arrears_interest_charges;
CREATE POLICY "org_interest_charges_select" ON arrears_interest_charges
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_interest_charges_insert" ON arrears_interest_charges;
CREATE POLICY "org_interest_charges_insert" ON arrears_interest_charges
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_interest_charges_waive" ON arrears_interest_charges;
CREATE POLICY "org_interest_charges_waive" ON arrears_interest_charges
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Bank statement imports
ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_bank_imports" ON bank_statement_imports;
CREATE POLICY "org_bank_imports" ON bank_statement_imports
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Bank statement lines
ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_stmt_lines" ON bank_statement_lines;
CREATE POLICY "org_stmt_lines" ON bank_statement_lines
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Tenant bank accounts
ALTER TABLE tenant_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_tenant_bank" ON tenant_bank_accounts;
CREATE POLICY "org_tenant_bank" ON tenant_bank_accounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );


-- =============================================================================
-- TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS update_leases_updated_at ON leases;
CREATE TRIGGER update_leases_updated_at
  BEFORE UPDATE ON leases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lease_renewal_offers_updated_at ON lease_renewal_offers;
CREATE TRIGGER update_lease_renewal_offers_updated_at
  BEFORE UPDATE ON lease_renewal_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lease_charges_updated_at ON lease_charges;
CREATE TRIGGER update_lease_charges_updated_at
  BEFORE UPDATE ON lease_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rent_invoices_updated_at ON rent_invoices;
CREATE TRIGGER update_rent_invoices_updated_at
  BEFORE UPDATE ON rent_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_owner_statements_updated_at ON owner_statements;
CREATE TRIGGER update_owner_statements_updated_at
  BEFORE UPDATE ON owner_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_arrears_cases_updated_at ON arrears_cases;
CREATE TRIGGER update_arrears_cases_updated_at
  BEFORE UPDATE ON arrears_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bank_statement_imports_updated_at ON bank_statement_imports;
CREATE TRIGGER update_bank_statement_imports_updated_at
  BEFORE UPDATE ON bank_statement_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Get prime rate on a given date (from 029)
CREATE OR REPLACE FUNCTION get_prime_rate_on(check_date date)
RETURNS numeric AS $$
  SELECT rate_percent
  FROM prime_rates
  WHERE effective_date <= check_date
  ORDER BY effective_date DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Get total unwaived arrears interest for a case (from 029)
CREATE OR REPLACE FUNCTION get_arrears_interest_total(p_case_id uuid)
RETURNS integer AS $$
  SELECT COALESCE(SUM(interest_cents), 0)::integer
  FROM arrears_interest_charges
  WHERE arrears_case_id = p_case_id
  AND waived = false;
$$ LANGUAGE sql STABLE;

-- Refresh the denormalised interest total on an arrears case (from 029)
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


-- =============================================================================
-- ADDENDUM_04A: CPA APPLICABILITY SNAPSHOT
-- =============================================================================
-- Franchise flag and three-state CPA snapshot set at lease activation.
-- The authoritative CPA state lives here — not on the property profile.
-- Future s14 auto-renewal notice logic reads cpa_applies_at_signing.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS is_franchise_agreement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cpa_applies_at_signing text
    CHECK (cpa_applies_at_signing IN ('yes', 'no', 'indeterminate')),
  ADD COLUMN IF NOT EXISTS cpa_determination_category text
    CHECK (cpa_determination_category IN (
      'natural_person',
      'franchise_agreement',
      'juristic_under_threshold',
      'juristic_over_threshold',
      'indeterminate_bands'
    )),
  ADD COLUMN IF NOT EXISTS cpa_determination_notes text,
  ADD COLUMN IF NOT EXISTS cpa_determined_at timestamptz;

COMMENT ON COLUMN leases.is_franchise_agreement IS
  'CPA s5(6): franchise agreements always attract CPA protection regardless '
  'of tenant entity or size.';
COMMENT ON COLUMN leases.cpa_applies_at_signing IS
  'Snapshot of CPA applicability at lease activation. Three-state: '
  'yes | no | indeterminate. Lease activation is blocked when this would '
  'be indeterminate — user must resolve size bands before signing.';
COMMENT ON COLUMN leases.cpa_determination_category IS
  'Structured reason for the cpa_applies_at_signing value. '
  'Used for reporting and Tribunal audit.';
COMMENT ON COLUMN leases.cpa_determination_notes IS
  'Audit notes capturing the actual values considered at signing.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_61: PAYMENT METHOD ON TRUST LEDGER ENTRIES (2026-04-27)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds payment_method to trust_transactions so the ledger can record HOW a
-- payment arrived (EFT, cash, card, or bank-recon match). Nullable because
-- adjustments, management fees, and owner payments have no payment instrument.

ALTER TABLE trust_transactions
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN (
      'eft', 'cash', 'card', 'bank_recon_matched'
    ));

COMMENT ON COLUMN trust_transactions.payment_method IS
  'Payment instrument used for this ledger entry. Set on rent_received and '
  'expense_paid transactions; null for adjustments and internal transfers. '
  'CHECK constraint mirrors payments.payment_method enum.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_63 Phase 5: LEASE LIFECYCLE COMMS IDEMPOTENCY COLUMNS (2026-05-04)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds per-lease timestamp guards so cron jobs can fire each lifecycle comm
-- exactly once without querying communication_log. Also adds sent_for_signing_at
-- so L2 sign-reminder cron has a stable anchor date independent of updated_at.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS sent_for_signing_at      timestamptz,
  ADD COLUMN IF NOT EXISTS sign_reminder_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_notice_sent_at timestamptz;

COMMENT ON COLUMN leases.sent_for_signing_at IS
  'Set when status changes to pending_signing (sendForSigning action). '
  'Anchor date for the L2 sign-reminder cron (T+3).';
COMMENT ON COLUMN leases.sign_reminder_sent_at IS
  'Set after L2 sign-reminder sent. NULL = reminder not yet sent.';
COMMENT ON COLUMN leases.expiry_reminder_sent_at IS
  'Set after L9 expiry-reminder sent (T-30). NULL = reminder not yet sent.';
COMMENT ON COLUMN leases.escalation_notice_sent_at IS
  'Set after L7 escalation-notice sent (T-30 before escalation_review_date). NULL = not yet sent.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §X  ADDENDUM_63B: NON-DAMAGE DEPOSIT CHARGES (2026-05-07)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Sibling table to deposit_deduction_items for non-inspection-derived deductions:
-- rent arrears, unpaid utilities, cleaning, contractual penalties, etc.
-- RHA s5(3)(c): "any other amount for which the tenant is liable under the lease".
-- Required for a Tribunal-grade itemised schedule (RHA s5(7)).

CREATE TABLE IF NOT EXISTS deposit_charges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  lease_id              uuid NOT NULL REFERENCES leases(id),
  reconciliation_id     uuid REFERENCES deposit_reconciliations(id),

  charge_type           text NOT NULL CHECK (charge_type IN (
                          'rent_arrears',
                          'unpaid_utilities',
                          'cleaning',
                          'contractual_penalty',
                          'lock_replacement',
                          'key_replacement',
                          'admin_fee',
                          'dilapidation',
                          'fittings_removal',
                          'early_termination_fee',
                          'other'
                        )),
  description           text NOT NULL,
  deduction_amount_cents integer NOT NULL CHECK (deduction_amount_cents > 0),

  -- Source references — plain uuid for cross-file FK targets (supplier_invoices,
  -- municipal_bills are in 005); rest carry real FKs.
  source_invoice_id          uuid REFERENCES rent_invoices(id),
  source_arrears_case_id     uuid REFERENCES arrears_cases(id),
  source_supplier_invoice_id uuid,   -- FK to supplier_invoices (005) — plain uuid
  source_municipal_bill_id   uuid,   -- FK to municipal_bills (005) — plain uuid
  source_lease_charge_id     uuid REFERENCES lease_charges(id),

  -- Set after disburse — links the settlement record back to the charge
  settling_payment_id        uuid REFERENCES payments(id),
  settling_deposit_txn_id    uuid REFERENCES deposit_transactions(id),

  supporting_doc_path text,
  notes               text,

  agent_confirmed  boolean NOT NULL DEFAULT false,
  confirmed_by     uuid REFERENCES auth.users(id),
  confirmed_at     timestamptz,
  tenant_disputed  boolean NOT NULL DEFAULT false,
  dispute_notes    text,
  dispute_resolved boolean NOT NULL DEFAULT false,
  dispute_resolution text,

  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_charges_lease
  ON deposit_charges(lease_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_recon
  ON deposit_charges(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_arrears
  ON deposit_charges(source_arrears_case_id)
  WHERE source_arrears_case_id IS NOT NULL;

ALTER TABLE deposit_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_deposit_charges" ON deposit_charges;
CREATE POLICY "org_deposit_charges" ON deposit_charges
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
  ));

DROP TRIGGER IF EXISTS update_deposit_charges_updated_at ON deposit_charges;
CREATE TRIGGER update_deposit_charges_updated_at
  BEFORE UPDATE ON deposit_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Extend deposit_transactions.transaction_type to cover non-damage charge patterns
ALTER TABLE deposit_transactions DROP CONSTRAINT IF EXISTS deposit_transactions_transaction_type_check;
ALTER TABLE deposit_transactions ADD CONSTRAINT deposit_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'deposit_received',
    'interest_accrued',
    'deduction_applied',         -- physical damage from inspection
    'charge_applied',            -- non-damage charge (arrears, utilities, ad-hoc)
    'deduction_reversed',
    'charge_reversed',
    'deposit_returned_to_tenant',
    'deduction_paid_to_landlord',
    'arrears_offset_to_invoice', -- deposit-side leg of a tenant-debt settlement
    'forfeited'
  ));

-- FK back to the deposit_charges row for the new transaction types
ALTER TABLE deposit_transactions
  ADD COLUMN IF NOT EXISTS charge_id uuid REFERENCES deposit_charges(id);

-- Extend payments.payment_method to support deposit-funded settlements
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN (
    'eft', 'cash', 'card', 'bank_recon_matched',
    'deposit_offset'   -- source of funds is the tenant's own deposit
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_64: TRUST RECONCILIATION CLOSE + AUDIT EXPORTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Monthly sign-off of trust account reconciliation. Produces immutable
-- closed-period records and regeneratable EAAB/PPRA audit exports.
--
-- Load-bearing invariant (D-TRUST-01): Pleks is not the trustee. Tables here
-- model the agency's view of their trust account, not Pleks's custody of funds.
-- There is no Pleks-owned bank_account row; the schema makes this impossible.

-- FFC expiry date for PPRA compliance dashboard (D-TRUST-16)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ppra_ffc_expiry_date date;

-- ─── trust_reconciliation_periods ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trust_reconciliation_periods (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          uuid NOT NULL REFERENCES organisations(id),
  bank_account_id                 uuid NOT NULL REFERENCES bank_accounts(id),

  period_start                    date NOT NULL,
  period_end                      date NOT NULL,

  -- Three-balance comparison (D-TRUST-04)
  bank_closing_balance_cents      bigint NOT NULL,
  ledger_closing_balance_cents    bigint NOT NULL,
  recon_computed_closing_cents    bigint NOT NULL,
  variance_cents                  bigint NOT NULL DEFAULT 0,
  variance_acknowledged           boolean NOT NULL DEFAULT false,

  -- Outstanding items at sign-off (D-TRUST-12)
  outstanding_items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Shape: [{ description: text, amount_cents: bigint,
  --           expected_clear_date: date, item_type:
  --           'deposit_in_transit'|'pending_clearing'|'uncleared_eft'|'other' }]

  -- Status (D-TRUST-05)
  status                          text NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'reconciled', 'signed_off', 'superseded')),

  -- Sign-off
  signed_off_at                   timestamptz,
  signed_off_by                   uuid REFERENCES auth.users(id),
  signed_off_ip                   inet,
  signed_off_notes                text,

  -- Audit export linkage (D-TRUST-09)
  audit_export_id                 uuid,  -- FK added after trust_audit_exports is created

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, bank_account_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_trp_org_period
  ON trust_reconciliation_periods(org_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_trp_status
  ON trust_reconciliation_periods(org_id, status)
  WHERE status IN ('open', 'reconciled');

ALTER TABLE trust_reconciliation_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_trust_periods_select" ON trust_reconciliation_periods;
CREATE POLICY "org_trust_periods_select" ON trust_reconciliation_periods
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "org_trust_periods_insert" ON trust_reconciliation_periods;
CREATE POLICY "org_trust_periods_insert" ON trust_reconciliation_periods
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Updates allowed ONLY while status != 'signed_off' (signed-off is immutable)
DROP POLICY IF EXISTS "org_trust_periods_update_open" ON trust_reconciliation_periods;
CREATE POLICY "org_trust_periods_update_open" ON trust_reconciliation_periods
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
    AND status != 'signed_off'
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
    AND status != 'signed_off'
  );

-- No DELETE ever
DROP POLICY IF EXISTS "trust_periods_no_delete" ON trust_reconciliation_periods;
CREATE POLICY "trust_periods_no_delete" ON trust_reconciliation_periods
  FOR DELETE USING (false);

DROP TRIGGER IF EXISTS update_trust_reconciliation_periods_updated_at ON trust_reconciliation_periods;
CREATE TRIGGER update_trust_reconciliation_periods_updated_at
  BEFORE UPDATE ON trust_reconciliation_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─── trust_audit_exports ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trust_audit_exports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  period_id             uuid NOT NULL REFERENCES trust_reconciliation_periods(id),

  pdf_storage_path      text NOT NULL,
  xlsx_storage_path     text NOT NULL,

  -- Tamper-evidence (D-TRUST-07)
  manifest_hash         text NOT NULL,  -- SHA-256 hex of (pdf_bytes || xlsx_bytes || ffc || signed_off_at)
  ffc_at_generation     text NOT NULL,  -- snapshot of organisations.ppra_ffc_number

  generated_at          timestamptz NOT NULL DEFAULT now(),
  generated_by          uuid NOT NULL REFERENCES auth.users(id),
  regeneration_reason   text  -- null for first generation; populated on regenerate

  -- NOTE: no UPDATE policy; exports are immutable records
);

CREATE INDEX IF NOT EXISTS idx_tae_period
  ON trust_audit_exports(period_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tae_org_generated
  ON trust_audit_exports(org_id, generated_at DESC);

ALTER TABLE trust_audit_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_trust_exports_select" ON trust_audit_exports;
CREATE POLICY "org_trust_exports_select" ON trust_audit_exports
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "org_trust_exports_insert" ON trust_audit_exports;
CREATE POLICY "org_trust_exports_insert" ON trust_audit_exports
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- No UPDATE, no DELETE
DROP POLICY IF EXISTS "trust_exports_no_update" ON trust_audit_exports;
CREATE POLICY "trust_exports_no_update" ON trust_audit_exports
  FOR UPDATE USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "trust_exports_no_delete" ON trust_audit_exports;
CREATE POLICY "trust_exports_no_delete" ON trust_audit_exports
  FOR DELETE USING (false);

-- Back-link FK on trust_reconciliation_periods now that trust_audit_exports exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'trust_reconciliation_periods'
      AND constraint_name = 'trust_reconciliation_periods_audit_export_fkey'
  ) THEN
    ALTER TABLE trust_reconciliation_periods
      ADD CONSTRAINT trust_reconciliation_periods_audit_export_fkey
      FOREIGN KEY (audit_export_id) REFERENCES trust_audit_exports(id);
  END IF;
END $$;


-- ─── bank_recon_sessions (formalises phantom reference — D-TRUST-10) ─────────
-- The trust-ledger page already queries this table at
-- app/(dashboard)/finance/trust-ledger/page.tsx:95 but the table was never
-- created. Today the query silently returns empty. Formalising it now.

CREATE TABLE IF NOT EXISTS bank_recon_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  bank_account_id   uuid NOT NULL REFERENCES bank_accounts(id),

  period_start      date NOT NULL,
  period_end        date NOT NULL,

  -- Progress state
  total_lines               integer NOT NULL DEFAULT 0,
  matched_lines             integer NOT NULL DEFAULT 0,
  unmatched_lines           integer NOT NULL DEFAULT 0,

  status            text NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'ready_for_close', 'signed_off', 'superseded')),

  signed_off_at     timestamptz,
  signed_off_by     uuid REFERENCES auth.users(id),

  -- Links to the close record (1:1 when signed-off)
  period_id         uuid REFERENCES trust_reconciliation_periods(id),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, bank_account_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_brs_org_period
  ON bank_recon_sessions(org_id, period_end DESC);

ALTER TABLE bank_recon_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_brs_select" ON bank_recon_sessions;
CREATE POLICY "org_brs_select" ON bank_recon_sessions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "org_brs_insert" ON bank_recon_sessions;
CREATE POLICY "org_brs_insert" ON bank_recon_sessions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "org_brs_update_open" ON bank_recon_sessions;
CREATE POLICY "org_brs_update_open" ON bank_recon_sessions
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
    AND status != 'signed_off'
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
    AND status != 'signed_off'
  );

DROP TRIGGER IF EXISTS update_bank_recon_sessions_updated_at ON bank_recon_sessions;
CREATE TRIGGER update_bank_recon_sessions_updated_at
  BEFORE UPDATE ON bank_recon_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─── Trigger: block UPDATE/DELETE on trust_transactions in closed periods ────
-- trust_transactions is already immutable (no UPDATE/DELETE policies) in the
-- base schema. This adds an additional safeguard at trigger level that prevents
-- any future policy change from accidentally allowing writes to closed-period rows.

CREATE OR REPLACE FUNCTION check_trust_txn_period_open()
RETURNS trigger AS $$
DECLARE
  is_in_closed_period boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM trust_reconciliation_periods trp
    WHERE trp.org_id = COALESCE(NEW.org_id, OLD.org_id)
      AND trp.status = 'signed_off'
      AND COALESCE(NEW.statement_month, OLD.statement_month) BETWEEN trp.period_start AND trp.period_end
  ) INTO is_in_closed_period;

  IF is_in_closed_period THEN
    RAISE EXCEPTION 'SOVEREIGN_TRUST_VIOLATION: trust_transaction in signed-off period is immutable. '
                    'Create a correcting entry in the current open period instead. '
                    'See brief/legal/TRUST_ACCOUNT_POSITIONING.md §4 for doctrine.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_trust_txn_period_check ON trust_transactions;
CREATE TRIGGER tr_trust_txn_period_check
  BEFORE UPDATE OR DELETE ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION check_trust_txn_period_open();

-- Also check on INSERT that the statement_month isn't in a closed period
-- (only applies when statement_month is set — null is fine, goes into current period)
CREATE OR REPLACE FUNCTION check_trust_txn_insert_period_open()
RETURNS trigger AS $$
DECLARE
  is_in_closed_period boolean;
BEGIN
  IF NEW.statement_month IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM trust_reconciliation_periods trp
    WHERE trp.org_id = NEW.org_id
      AND trp.status = 'signed_off'
      AND NEW.statement_month BETWEEN trp.period_start AND trp.period_end
  ) INTO is_in_closed_period;

  IF is_in_closed_period THEN
    RAISE EXCEPTION 'SOVEREIGN_TRUST_VIOLATION: cannot insert trust_transaction into signed-off period. '
                    'Use current open period instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_trust_txn_insert_period_check ON trust_transactions;
CREATE TRIGGER tr_trust_txn_insert_period_check
  BEFORE INSERT ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION check_trust_txn_insert_period_open();

-- Enforce one opening-balance entry per org per statement month
CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_txn_one_opening_per_period
  ON trust_transactions(org_id, statement_month)
  WHERE is_opening_balance = true;

-- ─── Storage bucket: trust-audit-exports ─────────────────────────────────────
-- Path: {org_id}/{period_id}/export-v{n}.pdf and .xlsx
-- INSERT via service-role only (bypasses RLS); SELECT restricted to org members.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trust-audit-exports',
  'trust-audit-exports',
  false,
  52428800,  -- 50 MB — PDF + XLSX bundle; retained indefinitely (D-TRUST-13)
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

DO $wrap$ BEGIN
DROP POLICY IF EXISTS "trust_exports_storage_select" ON storage.objects;
CREATE POLICY "trust_exports_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'trust-audit-exports'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pleks: storage policy skipped locally (needs storage_admin owner); applies on hosted';
END $wrap$;

-- ─── BUILD_64 fix: rename csv_storage_path → xlsx_storage_path ───────────────
-- The column stores an XLSX file path but was originally named csv_storage_path.
-- Idempotent: only renames if the old column name still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trust_audit_exports' AND column_name = 'csv_storage_path'
  ) THEN
    ALTER TABLE trust_audit_exports RENAME COLUMN csv_storage_path TO xlsx_storage_path;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADDENDUM_PHANTOM_COLUMN_TAIL D-1: stable per-lease payment reference (bank-match key)
-- ═══════════════════════════════════════════════════════════════════════════════
-- SA bank-statement reconciliation needs ONE stable reference per lease that the tenant puts on every
-- EFT (a per-invoice ref defeats matching). Deterministic from the lease id (reproducible/idempotent);
-- minted at activation (activateLeaseCascade) for new leases, backfilled here for existing ones.
ALTER TABLE leases ADD COLUMN IF NOT EXISTS payment_reference text;
UPDATE leases
SET payment_reference = 'PL' || upper(substring(replace(id::text, '-', '') from 1 for 8))
WHERE payment_reference IS NULL;
CREATE INDEX IF NOT EXISTS idx_leases_payment_reference ON leases(payment_reference) WHERE payment_reference IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADDENDUM_FINANCIAL_INTEGRITY F-2: a tenant_damage deduction can't be confirmed without a real reason
-- ═══════════════════════════════════════════════════════════════════════════════
-- Durable backstop for the app-side confirm gate (lib/actions/deposits.ts confirmDeductionItem). A tenant_damage
-- item only counts against the refund once agent_confirmed (calculateReturn sums confirmed items), and a confirmed
-- damage line MUST carry a substantive justification (RHA s5 / Tribunal). "Valid" excludes the legacy auto-
-- placeholders ("AI justification …") and anything too short — not just NULL (length 20 matches
-- MIN_JUSTIFICATION_LENGTH in lib/deposits/justification.ts). Inserts (agent_confirmed defaults false) and
-- non-damage classifications pass straight through.
CREATE OR REPLACE FUNCTION assert_deduction_justification() RETURNS trigger AS $$
BEGIN
  IF NEW.agent_confirmed AND NEW.classification = 'tenant_damage'
     AND (NEW.ai_justification IS NULL
          OR length(btrim(NEW.ai_justification)) < 20
          OR btrim(NEW.ai_justification) LIKE 'AI justification %') THEN
    RAISE EXCEPTION 'A tenant_damage deduction cannot be confirmed without a substantive justification (ADDENDUM_FINANCIAL_INTEGRITY F-2)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deduction_justification ON deposit_deduction_items;
CREATE TRIGGER trg_deduction_justification
  BEFORE INSERT OR UPDATE ON deposit_deduction_items
  FOR EACH ROW EXECUTE FUNCTION assert_deduction_justification();

-- F-2 (Pattern-C): ad-hoc deposit charges (no source invoice/arrears/supplier/municipal/lease ref) are
-- agent-asserted, so they need their own reason before they can be confirmed + disbursed (RHA s5). Gated in
-- lib/actions/deposits.ts confirmDepositCharge + lib/deposits/disburse.ts settlePatternC.
ALTER TABLE deposit_charges ADD COLUMN IF NOT EXISTS justification text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADDENDUM_FINANCIAL_INTEGRITY F-3 balance: provenance columns for the D-TRUST-01 guard
-- ═══════════════════════════════════════════════════════════════════════════════
-- assertPleksIsNotTrustee() reads source + initiated_by, but they never existed on the table (so the guard
-- couldn't act even if called). recordTrustTransaction() — now the single insert path — persists them. source
-- is never 'pleks_controlled_account' (no such account); initiated_by is never 'pleks_system' on an outbound
-- (debit) movement (Rules 1 + 2). Nullable — historical rows predate the columns; new rows always set them.
ALTER TABLE trust_transactions ADD COLUMN IF NOT EXISTS source text
  CHECK (source IS NULL OR source IN ('agency_bank', 'tenant_initiated', 'pleks_controlled_account'));
ALTER TABLE trust_transactions ADD COLUMN IF NOT EXISTS initiated_by text
  CHECK (initiated_by IS NULL OR initiated_by IN ('agent', 'tenant', 'pleks_system'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §  PRE-SCALE PERFORMANCE INDEXES (leases / rent_invoices / payments / deposits / trust)
--   Hot list ORDER, calendar/CPA range scans, arrears scans, and join/cascade FKs
--   (deposit_transactions had NO org_id index). Additive + idempotent. See 005 / 011 / 012.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Leases list: WHERE org_id AND deleted_at IS NULL ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_leases_org_created_active
  ON leases(org_id, created_at DESC) WHERE deleted_at IS NULL;

-- Calendar / CPA notices: WHERE org_id AND status IN (…) AND end_date <range>
CREATE INDEX IF NOT EXISTS idx_leases_org_status_end
  ON leases(org_id, status, end_date);

-- Arrears scans: WHERE org_id AND due_date <= today (properties collection + arrears cron)
CREATE INDEX IF NOT EXISTS idx_rent_invoices_org_due
  ON rent_invoices(org_id, due_date);

-- Payment → invoice join + activity feed (WHERE org_id AND payment_date >= …)
CREATE INDEX IF NOT EXISTS idx_payments_invoice
  ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_org_date
  ON payments(org_id, payment_date DESC);

-- Deposit transactions: org-scoped reads had NO org_id index; + tenant join/cascade
CREATE INDEX IF NOT EXISTS idx_deposit_txns_org
  ON deposit_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_deposit_txns_tenant
  ON deposit_transactions(tenant_id) WHERE tenant_id IS NOT NULL;

-- Trust ledger by lease (lease ledger view + FK cascade)
CREATE INDEX IF NOT EXISTS idx_trust_tx_lease
  ON trust_transactions(lease_id) WHERE lease_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §  BUILD_69A: per-lease deposit/trust account selection (ADDENDUM_69A)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The trust account rent is paid into + the deposit-holding account the deposit sits in, chosen per lease
-- from the org's own bank_accounts (the wizard filters to non-business types; D-TRUST-01: Pleks records,
-- is not the trustee). The selected deposit_account_id feeds account-scoped interest resolution
-- (deposit_interest_config.bank_account_id — see 008 §BUILD_69A). bank_accounts is created in 001 (before
-- this file), so the FKs resolve on replay.
ALTER TABLE leases ADD COLUMN IF NOT EXISTS deposit_account_id uuid REFERENCES bank_accounts(id);
ALTER TABLE leases ADD COLUMN IF NOT EXISTS trust_account_id   uuid REFERENCES bank_accounts(id);
CREATE INDEX IF NOT EXISTS idx_leases_deposit_account ON leases(deposit_account_id) WHERE deposit_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leases_trust_account   ON leases(trust_account_id)   WHERE trust_account_id   IS NOT NULL;

-- NOTE: an earlier 69A draft added leases.deposit_interest_beneficiary (a §7.2 election). REMOVED by the
-- 2026-06-18 ownership correction: residential deposit interest is statutory (always the tenant, RHA
-- s5(3)(d)), not a contractual election — so there is no beneficiary field and the deposit clause states
-- the lessee literally. The column was dropped from live in the same change.

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY BATCH 2026-07-02: index erasure-path + high-growth foreign keys.
--     Rule: index unindexed FKs that are erasure/cascade paths or hot joins —
--       (1) auth.users FKs on erasure-reachable SUBJECT-DATA tables (cold audit/config/
--           reference tables skipped: small, the planner seq-scans them regardless);
--       (2) ALL contacts + tenants FKs (POPIA erasure/anonymise cascade — protects P-1);
--       (3) org_id + hot domain/self-ref FKs on HIGH-GROWTH child tables.
--     DEFERRED BY DECISION (~119 advisor unindexed-FK lints remain — do NOT re-litigate):
--       teams refs (named-teams Layer 1 unwired), policy-table refs, and cold-table org_id
--       (→ a post-traffic org_id pass justified by pg_stat_user_indexes). See INDEX.md.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_arrears_actions_approved_by ON arrears_actions(approved_by);
CREATE INDEX IF NOT EXISTS idx_arrears_cases_property_id ON arrears_cases(property_id);
CREATE INDEX IF NOT EXISTS idx_arrears_cases_resolved_by ON arrears_cases(resolved_by);
CREATE INDEX IF NOT EXISTS idx_arrears_cases_unit_id ON arrears_cases(unit_id);
CREATE INDEX IF NOT EXISTS idx_arrears_interest_charges_lease_id ON arrears_interest_charges(lease_id);
CREATE INDEX IF NOT EXISTS idx_arrears_interest_charges_tenant_id ON arrears_interest_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arrears_interest_charges_waived_by ON arrears_interest_charges(waived_by);
CREATE INDEX IF NOT EXISTS idx_bank_recon_sessions_signed_off_by ON bank_recon_sessions(signed_off_by);
CREATE INDEX IF NOT EXISTS idx_bank_statement_imports_created_by ON bank_statement_imports(created_by);
CREATE INDEX IF NOT EXISTS idx_bank_statement_imports_reconciled_by ON bank_statement_imports(reconciled_by);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_ai_match_confirmed_by ON bank_statement_lines(ai_match_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_matched_invoice_id ON bank_statement_lines(matched_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_matched_payment_id ON bank_statement_lines(matched_payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_matched_trust_txn_id ON bank_statement_lines(matched_trust_txn_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_resolved_by ON bank_statement_lines(resolved_by);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_confirmed_by ON deposit_charges(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_created_by ON deposit_charges(created_by);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_org_id ON deposit_charges(org_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_settling_deposit_txn_id ON deposit_charges(settling_deposit_txn_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_settling_payment_id ON deposit_charges(settling_payment_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_source_invoice_id ON deposit_charges(source_invoice_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_source_lease_charge_id ON deposit_charges(source_lease_charge_id);
CREATE INDEX IF NOT EXISTS idx_deposit_deduction_items_confirmed_by ON deposit_deduction_items(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_deposit_deduction_items_inspection_id ON deposit_deduction_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_deposit_deduction_items_org_id ON deposit_deduction_items(org_id);
CREATE INDEX IF NOT EXISTS idx_deposit_reconciliations_tenant_id ON deposit_reconciliations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_charge_id ON deposit_transactions(charge_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_created_by ON deposit_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_deduction_item_id ON deposit_transactions(deduction_item_id);
-- idx_deposit_transactions_rate_config_id moved to 008: rate_config_id is added there. (replay fix 2026-07-06)
CREATE INDEX IF NOT EXISTS idx_lease_amendments_created_by ON lease_amendments(created_by);
CREATE INDEX IF NOT EXISTS idx_lease_charges_created_by ON lease_charges(created_by);
CREATE INDEX IF NOT EXISTS idx_lease_lifecycle_events_triggered_by_user ON lease_lifecycle_events(triggered_by_user);
CREATE INDEX IF NOT EXISTS idx_lease_renewal_offers_created_by ON lease_renewal_offers(created_by);
CREATE INDEX IF NOT EXISTS idx_leases_created_by ON leases(created_by);
CREATE INDEX IF NOT EXISTS idx_owner_statements_generated_by ON owner_statements(generated_by);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON payments(recorded_by);
CREATE INDEX IF NOT EXISTS idx_rent_invoices_tenant_id ON rent_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_invoices_unit_id ON rent_invoices(unit_id);
CREATE INDEX IF NOT EXISTS idx_tenant_bank_accounts_tenant_id ON tenant_bank_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trust_audit_exports_generated_by ON trust_audit_exports(generated_by);
CREATE INDEX IF NOT EXISTS idx_trust_reconciliation_periods_signed_off_by ON trust_reconciliation_periods(signed_off_by);
CREATE INDEX IF NOT EXISTS idx_trust_transactions_created_by ON trust_transactions(created_by);
-- idx_trust_transactions_maintenance_request_id moved to 008: maintenance_request_id is added there. (replay fix 2026-07-06)
CREATE INDEX IF NOT EXISTS idx_trust_transactions_unit_id ON trust_transactions(unit_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM_TRUST_RPC_ATOMICITY step 0 (2026-07-02): D-TRUST-01 sovereignty guard
--   as a BEFORE INSERT trigger — the CANONICAL enforcement of record. Mirrors the
--   §4 closed-period trigger so the guard fires on EVERY insert path (the JS
--   recordTrustTransaction helper, the atomic-write plpgsql RPCs, raw SQL, psql),
--   not only the JS path the coverage ratchet can see. assertPleksIsNotTrustee()
--   in lib/trust/invariants.ts stays as the app-layer early-fail MIRROR.
--   Rule definitions — single source of truth: TRUST_ACCOUNT_POSITIONING.md §3.2
--   + ADDENDUM_TRUST_RPC_ATOMICITY §2:
--     Rule 1: source = 'pleks_controlled_account'                          → violation
--     Rule 2: direction = 'debit' (outbound) AND initiated_by = 'pleks_system' → violation
--   NULL source/initiated_by (pre-F-3 rows) pass — only the two explicit rules RAISE.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_trust_txn_sovereignty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Rule 1: Pleks never controls a fund-holding account.
  IF NEW.source = 'pleks_controlled_account' THEN
    RAISE EXCEPTION 'SOVEREIGN_TRUST_VIOLATION: Pleks does not control any account capable of holding client funds (source=pleks_controlled_account). See brief/legal/TRUST_ACCOUNT_POSITIONING.md.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 2: Pleks never initiates outbound fund movement (debit = outbound).
  IF NEW.direction = 'debit' AND NEW.initiated_by = 'pleks_system' THEN
    RAISE EXCEPTION 'SOVEREIGN_TRUST_VIOLATION: Pleks system processes cannot initiate outbound fund movement (direction=debit, initiated_by=pleks_system). See brief/legal/TRUST_ACCOUNT_POSITIONING.md.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_trust_txn_sovereignty ON trust_transactions;
CREATE TRIGGER tr_trust_txn_sovereignty
  BEFORE INSERT ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION check_trust_txn_sovereignty();

-- Existence/enabled ratchet for the sovereignty trigger (CD condition 3): returns false if the
-- trigger is DROPPED or DISABLED (tgenabled = 'D'), so scripts/security/trust-sovereignty-parity.mts
-- fails CI on silent removal. service_role only (called from the DB security audit).
CREATE OR REPLACE FUNCTION trust_sovereignty_trigger_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(bool_or(t.tgenabled <> 'D'), false)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'trust_transactions'
    AND t.tgname = 'tr_trust_txn_sovereignty'
    AND NOT t.tgisinternal;
$$;

REVOKE EXECUTE ON FUNCTION trust_sovereignty_trigger_enabled() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM_TRUST_RPC_ATOMICITY step 1 (2026-07-02): atomic money+trust write
--   record_payment_atomic() folds the money-invariant writes into ONE plpgsql
--   transaction so a partial failure can't leave a payment with no trust credit
--   (the old recordPayment .catch()-swallowed the trust insert). In scope: the
--   org-scoped invoice resolve, the payments insert, the trust_transactions
--   rent_received credit, AND the clause-6.6 allocation (interest-first, then oldest
--   rent) via allocate_payment_atomic — one allocation, in-transaction (the old
--   "credit the selected invoice in full" + post-commit allocatePayment() together
--   DOUBLE-applied). OUT of scope (stay post-commit in the caller): receipt_path, email, audit,
--   revalidatePath — side effects that may fail/retry independently. The trust
--   insert fires the §step-0 sovereignty trigger + the §4 closed-period trigger;
--   any RAISE rolls back the whole function.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_payment_atomic(
  p_org_id         uuid,
  p_invoice_id     uuid,
  p_amount_cents   bigint,
  p_payment_date   date,
  p_method         text,
  p_reference      text,
  p_recorded_by    uuid,
  p_receipt_number text,
  p_notes          text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv        rent_invoices%ROWTYPE;
  v_payment_id uuid;
BEGIN
  -- Org-scope guard: the invoice MUST belong to the caller's org (service_role bypasses RLS).
  SELECT * INTO v_inv FROM rent_invoices WHERE id = p_invoice_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_payment_atomic: invoice % not found in org %', p_invoice_id, p_org_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 1. payment (provenance only: invoice_id = the agent-selected invoice. Allocation in step 3 follows
  --    clause 6.6, so the money may land on interest / older invoices — surplus_cents + allocated_invoices
  --    are filled by allocate_payment_atomic, NOT pre-credited to the selected invoice).
  INSERT INTO payments (
    org_id, invoice_id, lease_id, tenant_id, amount_cents, payment_date, payment_method,
    reference, receipt_number, recorded_by, surplus_cents, surplus_disposition, allocated_invoices, notes
  ) VALUES (
    p_org_id, p_invoice_id, v_inv.lease_id, v_inv.tenant_id, p_amount_cents, p_payment_date, p_method,
    p_reference, p_receipt_number, p_recorded_by, 0, NULL, '[]'::jsonb, p_notes
  ) RETURNING id INTO v_payment_id;

  -- 2. trust posting (rent_received credit) — sovereignty + closed-period triggers fire here.
  INSERT INTO trust_transactions (
    org_id, transaction_type, direction, amount_cents, description,
    unit_id, lease_id, reference, invoice_id, statement_month, created_by, source, initiated_by
  ) VALUES (
    p_org_id, 'rent_received', 'credit', p_amount_cents,
    'Payment received — ' || upper(p_method) || CASE WHEN p_reference IS NOT NULL AND p_reference <> '' THEN ' ref: ' || p_reference ELSE '' END,
    v_inv.unit_id, v_inv.lease_id, p_receipt_number, p_invoice_id,
    date_trunc('month', CURRENT_DATE)::date, p_recorded_by, 'agency_bank', 'agent'
  );

  -- 3. clause-6.6 allocation — interest oldest-first, then open invoices oldest-first, surplus recorded.
  --    ONE allocation, in-transaction. Replaces the old "credit the selected invoice in full" step + the
  --    post-commit allocatePayment() that TOGETHER double-applied the amount (any partial / interest /
  --    older-invoice case). The selected invoice is advisory — the money follows clause-6.6 order.
  IF v_inv.lease_id IS NOT NULL THEN
    PERFORM allocate_payment_atomic(p_org_id, v_payment_id, v_inv.lease_id, p_amount_cents, p_recorded_by);
  END IF;

  RETURN v_payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_payment_atomic(uuid,uuid,bigint,date,text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- allocate_payment_atomic() — lease clause 6.6 allocation (interest-first, then oldest rent), atomic.
--   Called INSIDE record_payment_atomic so payment + trust + allocation commit as one; the recordPayment
--   AND bulk-import paths both route through that RPC now. Interest charges (oldest charge_date) are waived
--   first, then open invoices (oldest due_date) are paid down, and any remainder is recorded as payment
--   surplus. allocated_invoices records where the money actually landed. This is the single allocation
--   authority for the recordPayment path; the TS allocatePayment() remains ONLY for deposit disburse
--   (Pattern A) until Step 4 folds that into disburse_deposit_atomic. (ledger double-count fix 2026-07-06)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION allocate_payment_atomic(
  p_org_id       uuid,
  p_payment_id   uuid,
  p_lease_id     uuid,
  p_amount_cents bigint,
  p_actor        uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remaining        bigint := p_amount_cents;
  v_interest_applied bigint := 0;
  v_rent_applied     bigint := 0;
  v_apply            bigint;
  v_new_balance      bigint;
  v_allocated        jsonb  := '[]'::jsonb;
  v_case_ids         uuid[] := ARRAY[]::uuid[];
  r_charge           record;
  r_inv              record;
  v_case             uuid;
BEGIN
  -- STEP 1 — interest charges, oldest charge_date first (clause 6.6: interest/damages before rent).
  FOR r_charge IN
    SELECT id, interest_cents, arrears_case_id
    FROM arrears_interest_charges
    WHERE lease_id = p_lease_id AND waived = false
    ORDER BY charge_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, r_charge.interest_cents);
    UPDATE arrears_interest_charges
      SET waived = true,
          waived_reason = 'Consumed by payment ' || p_payment_id,
          waived_at = now()
      WHERE id = r_charge.id;
    v_remaining        := v_remaining - v_apply;
    v_interest_applied := v_interest_applied + v_apply;
    IF r_charge.arrears_case_id IS NOT NULL THEN
      v_case_ids := array_append(v_case_ids, r_charge.arrears_case_id);
    END IF;
  END LOOP;

  -- STEP 2 — open rent invoices, oldest due_date first.
  FOR r_inv IN
    SELECT id, balance_cents
    FROM rent_invoices
    WHERE lease_id = p_lease_id AND status IN ('open', 'partial', 'overdue')
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF COALESCE(r_inv.balance_cents, 0) <= 0 THEN CONTINUE; END IF;
    v_apply       := LEAST(v_remaining, r_inv.balance_cents);
    v_new_balance := r_inv.balance_cents - v_apply;
    UPDATE rent_invoices SET
      amount_paid_cents = COALESCE(amount_paid_cents, 0) + v_apply,
      balance_cents     = v_new_balance,
      status            = CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END,
      paid_at           = CASE WHEN v_new_balance <= 0 THEN now() ELSE NULL END
    WHERE id = r_inv.id;
    v_remaining    := v_remaining - v_apply;
    v_rent_applied := v_rent_applied + v_apply;
    v_allocated    := v_allocated || jsonb_build_array(
                        jsonb_build_object('invoice_id', r_inv.id, 'amount_cents', v_apply));
  END LOOP;

  -- STEP 3 — record the breakdown on the payment (surplus = unallocated remainder).
  UPDATE payments SET
    interest_applied_cents = v_interest_applied,
    surplus_cents          = v_remaining,
    surplus_disposition    = CASE WHEN v_remaining > 0 THEN 'pending' ELSE NULL END,
    allocated_invoices     = v_allocated
  WHERE id = p_payment_id;

  -- STEP 4 — refresh arrears interest totals for each touched case.
  FOR v_case IN SELECT DISTINCT unnest(v_case_ids) LOOP
    PERFORM refresh_arrears_interest_total(v_case);
  END LOOP;

  -- STEP 5 — audit the money event with its breakdown (mirrors the old TS payment_allocated audit).
  INSERT INTO audit_log (org_id, table_name, record_id, action, changed_by, new_values)
  VALUES (p_org_id, 'payments', p_payment_id, 'UPDATE', p_actor, jsonb_build_object(
    'action', 'payment_allocated', 'lease_id', p_lease_id,
    'interest_applied_cents', v_interest_applied,
    'rent_applied_cents', v_rent_applied,
    'surplus_cents', v_remaining));

  RETURN jsonb_build_object(
    'interest_applied_cents', v_interest_applied,
    'rent_applied_cents', v_rent_applied,
    'surplus_cents', v_remaining,
    'allocated_invoices', v_allocated);
END;
$$;

REVOKE EXECUTE ON FUNCTION allocate_payment_atomic(uuid,uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
-- deposit disburse (Pattern A) calls this DIRECTLY via the service-role client (PostgREST), not just
-- internally from record_payment_atomic — so grant it explicitly. (ledger double-count fix 2026-07-06)
GRANT EXECUTE ON FUNCTION allocate_payment_atomic(uuid,uuid,uuid,bigint,uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- disburse_deposit_atomic() — the deposit-disbursement MAIN sequence in ONE transaction.
--   Refund + deduction (deposit_transactions debit + their trust postings), forfeiture flag, recon
--   status, and timer all commit together — so a failed trust insert can no longer leave a committed
--   deposit_transactions debit with no trust credit and a recon falsely marked 'refunded' (the old
--   lib/deposits/disburse.ts had the two trust postings as log-only .catch()). Inserting
--   trust_transactions DIRECTLY makes the §step-0 sovereignty + §4 closed-period triggers enforce
--   D-TRUST-01 — any RAISE rolls the whole disbursement back. Column sets + trust semantics
--   (deposit_returned debit / deposit_deduction credit, agency_bank / agent) taken verbatim from the
--   TS helpers. OUT of scope, post-commit in the caller: charge-settlement loop (Patterns A/B/C),
--   audit_log, tenant comm. (deposit atomicity — Step 4a 2026-07-06)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION disburse_deposit_atomic(
  p_org_id      uuid,
  p_lease_id    uuid,
  p_actor       uuid,
  p_reference   text,
  p_tenant_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recon deposit_reconciliations%ROWTYPE;
BEGIN
  -- Org-scope guard: the reconciliation MUST belong to the caller's org (service_role bypasses RLS).
  SELECT * INTO v_recon FROM deposit_reconciliations WHERE lease_id = p_lease_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'disburse_deposit_atomic: reconciliation for lease % not found in org %', p_lease_id, p_org_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 1. refund to tenant (deposit debit + trust deposit_returned debit — outbound, agent-initiated)
  IF COALESCE(v_recon.refund_to_tenant_cents, 0) > 0 THEN
    INSERT INTO deposit_transactions (
      org_id, lease_id, tenant_id, transaction_type, direction, amount_cents, description, reference, created_by
    ) VALUES (
      p_org_id, p_lease_id, v_recon.tenant_id, 'deposit_returned_to_tenant', 'debit',
      v_recon.refund_to_tenant_cents, 'Deposit refund — ' || p_tenant_name, p_reference, p_actor
    );
    INSERT INTO trust_transactions (
      org_id, transaction_type, direction, amount_cents, description, lease_id, created_by, source, initiated_by
    ) VALUES (
      p_org_id, 'deposit_returned', 'debit', v_recon.refund_to_tenant_cents,
      'Deposit refund to tenant — ' || p_tenant_name, p_lease_id, p_actor, 'agency_bank', 'agent'
    );
  END IF;

  -- 2. deductions to landlord (deposit debit + trust deposit_deduction credit — recovers the expense)
  IF COALESCE(v_recon.deductions_to_landlord_cents, 0) > 0 THEN
    INSERT INTO deposit_transactions (
      org_id, lease_id, tenant_id, transaction_type, direction, amount_cents, description, reference, created_by
    ) VALUES (
      p_org_id, p_lease_id, v_recon.tenant_id, 'deduction_paid_to_landlord', 'debit',
      v_recon.deductions_to_landlord_cents, 'Deposit deductions to landlord', p_reference, p_actor
    );
    INSERT INTO trust_transactions (
      org_id, transaction_type, direction, amount_cents, description, lease_id, created_by, source, initiated_by
    ) VALUES (
      p_org_id, 'deposit_deduction', 'credit', v_recon.deductions_to_landlord_cents,
      'Deposit deductions received', p_lease_id, p_actor, 'agency_bank', 'agent'
    );
  END IF;

  -- 3. forfeiture — nothing refunded, no deductions, but a deposit was held (unclaimed within statute)
  IF COALESCE(v_recon.refund_to_tenant_cents, 0) = 0
     AND COALESCE(v_recon.total_deductions_cents, 0) = 0
     AND COALESCE(v_recon.deposit_held_cents, 0) > 0 THEN
    UPDATE deposit_reconciliations SET
      is_forfeited = true,
      sars_taxable_flagged = true,
      forfeiture_reason = 'Tenant did not claim refund within statutory period'
    WHERE lease_id = p_lease_id AND org_id = p_org_id;
  END IF;

  -- 4. mark the reconciliation complete + close the timer
  UPDATE deposit_reconciliations SET
    status = 'refunded',
    tenant_refund_paid_at = now(),
    tenant_refund_reference = p_reference,
    updated_at = now()
  WHERE lease_id = p_lease_id AND org_id = p_org_id;

  UPDATE deposit_timers SET
    status = 'completed',
    completed_at = now()
  WHERE lease_id = p_lease_id AND org_id = p_org_id AND status = 'running';
END;
$$;

REVOKE EXECUTE ON FUNCTION disburse_deposit_atomic(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION disburse_deposit_atomic(uuid,uuid,uuid,text,text) TO service_role;

-- Kill-between-writes regression probe (CD step-1 gate): forces the LAST write (trust insert) to
-- fail via a signed-off period covering this month, then asserts the payment inserted first was
-- rolled back. Fully self-contained — the probe's period insert + the RPC's writes all abort in a
-- caught subtransaction, so nothing persists. Called by trust-sovereignty-parity.mts in security:db.
CREATE OR REPLACE FUNCTION verify_record_payment_atomicity()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv    rent_invoices%ROWTYPE;
  v_bank   uuid;
  v_before bigint;
  v_after  bigint;
BEGIN
  SELECT * INTO v_inv FROM rent_invoices ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'SKIP: no rent_invoices to probe'; END IF;
  SELECT id INTO v_bank FROM bank_accounts WHERE org_id = v_inv.org_id LIMIT 1;
  IF v_bank IS NULL THEN RETURN 'SKIP: no bank_account for org'; END IF;

  SELECT count(*) INTO v_before FROM payments WHERE invoice_id = v_inv.id;

  BEGIN
    INSERT INTO trust_reconciliation_periods (
      org_id, bank_account_id, period_start, period_end,
      bank_closing_balance_cents, ledger_closing_balance_cents, recon_computed_closing_cents, status
    ) VALUES (
      v_inv.org_id, v_bank, date_trunc('month', CURRENT_DATE)::date,
      (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date, 0, 0, 0, 'signed_off'
    );
    PERFORM record_payment_atomic(v_inv.org_id, v_inv.id, 1, CURRENT_DATE, 'eft', 'atomicity-probe', NULL, 'ATOMICITY-PROBE', NULL);
    RAISE EXCEPTION 'probe-did-not-fail: trust insert was not blocked';
  EXCEPTION WHEN others THEN
    NULL; -- expected: the subtransaction (period insert + RPC writes) rolled back
  END;

  SELECT count(*) INTO v_after FROM payments WHERE invoice_id = v_inv.id;
  IF v_after = v_before THEN
    RETURN 'PASS: payment rolled back when trust posting failed (count=' || v_before || ')';
  END IF;
  RETURN 'FAIL: payment persisted despite trust failure (before=' || v_before || ' after=' || v_after || ')';
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_record_payment_atomicity() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM_TRUST_RPC_ATOMICITY step 2 (2026-07-02): atomic deposit+trust write
--   record_deposit_atomic() folds the deposit sub-ledger write and its trust
--   posting into ONE transaction so a partial failure can't leave the two
--   ledgers disagreeing (the old paths wrote them separately; the trust insert
--   was .catch()-swallowed on the interest run). One discriminated RPC covers
--   BOTH callers (§5.2) — stepRecordDeposit (deposit_received / initiated_by
--   'agent') and accrueDepositInterest (interest_accrued / 'pleks_system').
--   direction + source are constant (credit / agency_bank). Column set taken
--   verbatim from the two helpers — nothing invented. OUT of scope, post-commit
--   in the caller: leases.deposit_interest_last_accrued_date + audit_log.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_deposit_atomic(
  p_org_id                uuid,
  p_lease_id              uuid,
  p_tenant_id             uuid,
  p_amount_cents          bigint,
  p_dep_txn_type          text,
  p_dep_description       text,
  p_trust_txn_type        text,
  p_trust_description      text,
  p_initiated_by          text,
  p_created_by            uuid,
  p_property_id           uuid,
  p_unit_id               uuid,
  p_reference             text,
  p_effective_rate_percent numeric,
  p_rate_config_id        uuid,
  p_statement_month       date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_dep_id uuid;
BEGIN
  INSERT INTO deposit_transactions (
    org_id, lease_id, tenant_id, transaction_type, direction, amount_cents, description,
    created_by, reference, effective_rate_percent, rate_config_id
  ) VALUES (
    p_org_id, p_lease_id, p_tenant_id, p_dep_txn_type, 'credit', p_amount_cents, p_dep_description,
    p_created_by, p_reference, p_effective_rate_percent, p_rate_config_id
  ) RETURNING id INTO v_dep_id;

  -- Trust posting — sovereignty + closed-period triggers fire here; any RAISE rolls back the deposit insert.
  INSERT INTO trust_transactions (
    org_id, transaction_type, direction, amount_cents, description,
    property_id, unit_id, lease_id, statement_month, created_by, source, initiated_by
  ) VALUES (
    p_org_id, p_trust_txn_type, 'credit', p_amount_cents, p_trust_description,
    p_property_id, p_unit_id, p_lease_id, p_statement_month, p_created_by, 'agency_bank', p_initiated_by
  );

  RETURN v_dep_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_deposit_atomic(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid,uuid,text,numeric,uuid,date) FROM PUBLIC, anon, authenticated;

-- Kill-between-writes regression probe (CD step-1 gate, applied to the deposit path): forces the
-- trust insert (2nd write) to fail via a signed-off period, asserts the deposit_transactions insert
-- rolled back. Self-contained — rolls itself back. Called by trust-sovereignty-parity.mts.
CREATE OR REPLACE FUNCTION verify_record_deposit_atomicity()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lease_id uuid; v_org uuid; v_tenant uuid; v_bank uuid; v_before bigint; v_after bigint;
BEGIN
  SELECT id, org_id, tenant_id INTO v_lease_id, v_org, v_tenant
    FROM leases WHERE tenant_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  IF v_lease_id IS NULL THEN RETURN 'SKIP: no lease with tenant'; END IF;
  SELECT id INTO v_bank FROM bank_accounts WHERE org_id = v_org LIMIT 1;
  IF v_bank IS NULL THEN RETURN 'SKIP: no bank_account for org'; END IF;

  SELECT count(*) INTO v_before FROM deposit_transactions WHERE lease_id = v_lease_id;
  BEGIN
    INSERT INTO trust_reconciliation_periods (org_id, bank_account_id, period_start, period_end,
      bank_closing_balance_cents, ledger_closing_balance_cents, recon_computed_closing_cents, status)
    VALUES (v_org, v_bank, date_trunc('month', CURRENT_DATE)::date,
      (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date, 0, 0, 0, 'signed_off');
    PERFORM record_deposit_atomic(v_org, v_lease_id, v_tenant, 1, 'interest_accrued', 'atomicity-probe',
      'deposit_interest', 'atomicity-probe', 'pleks_system', NULL, NULL, NULL, 'ATOMICITY-PROBE', NULL, NULL,
      date_trunc('month', CURRENT_DATE)::date);
    RAISE EXCEPTION 'probe-did-not-fail: trust insert was not blocked';
  EXCEPTION WHEN others THEN NULL; END;

  SELECT count(*) INTO v_after FROM deposit_transactions WHERE lease_id = v_lease_id;
  IF v_after = v_before THEN
    RETURN 'PASS: deposit rolled back when trust posting failed (count=' || v_before || ')';
  END IF;
  RETURN 'FAIL: deposit persisted despite trust failure (before=' || v_before || ' after=' || v_after || ')';
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_record_deposit_atomicity() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM_TRUST_RPC_ATOMICITY step 3 (2026-07-02): route the remaining trust
--   co-writes through atomic RPCs (sweep result).
--   (a) apply_invoice_payment_atomic — the bulk invoice-apply path
--       (app/api/rent-invoices) updates an invoice + posts trust but records NO
--       payment row, so record_payment_atomic (which inserts a payment) doesn't
--       fit — this is its narrow sibling: invoice status + trust rent_received.
--   (b) record_deposit_atomic gains is_opening_balance + trust reference (DROP +
--       CREATE with defaults, so the step-2 callers stay 16-arg) — so the lease
--       import migration deposit can route through it while keeping its opening-
--       balance flag (idx_trust_txn_one_opening_per_period) + MIGRATION ref.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION apply_invoice_payment_atomic(
  p_org_id       uuid,
  p_invoice_id   uuid,
  p_amount_cents bigint,
  p_payment_date date,
  p_method       text,
  p_reference    text,
  p_recorded_by  uuid
) RETURNS bigint            -- cents actually applied (0 if the invoice is already settled)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_inv rent_invoices%ROWTYPE; v_applied bigint; v_new_paid bigint; v_new_balance bigint; v_status text;
BEGIN
  SELECT * INTO v_inv FROM rent_invoices WHERE id = p_invoice_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_invoice_payment_atomic: invoice % not found in org %', p_invoice_id, p_org_id USING ERRCODE = 'no_data_found';
  END IF;
  IF COALESCE(v_inv.balance_cents, 0) <= 0 THEN RETURN 0; END IF;

  v_applied     := LEAST(p_amount_cents, v_inv.balance_cents);
  v_new_paid    := COALESCE(v_inv.amount_paid_cents, 0) + v_applied;
  v_new_balance := v_inv.balance_cents - v_applied;
  v_status      := CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE rent_invoices SET
    amount_paid_cents = v_new_paid,
    balance_cents     = v_new_balance,
    status            = v_status,
    paid_at           = CASE WHEN v_new_balance <= 0 THEN p_payment_date ELSE NULL END,
    updated_at        = now()
  WHERE id = p_invoice_id;

  INSERT INTO trust_transactions (
    org_id, transaction_type, direction, amount_cents, description,
    unit_id, lease_id, reference, invoice_id, payment_method, statement_month, created_by, source, initiated_by
  ) VALUES (
    p_org_id, 'rent_received', 'credit', v_applied,
    'Rent payment' || CASE WHEN p_reference IS NOT NULL AND p_reference <> '' THEN ' — ref: ' || p_reference ELSE '' END,
    v_inv.unit_id, v_inv.lease_id, p_reference, p_invoice_id, p_method,
    date_trunc('month', p_payment_date)::date, p_recorded_by, 'agency_bank', 'agent'
  );

  RETURN v_applied;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_invoice_payment_atomic(uuid,uuid,bigint,date,text,text,uuid) FROM PUBLIC, anon, authenticated;

-- Extend record_deposit_atomic with the two fields the lease-import opening balance needs.
DROP FUNCTION IF EXISTS record_deposit_atomic(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid,uuid,text,numeric,uuid,date);
CREATE OR REPLACE FUNCTION record_deposit_atomic(
  p_org_id                uuid,
  p_lease_id              uuid,
  p_tenant_id             uuid,
  p_amount_cents          bigint,
  p_dep_txn_type          text,
  p_dep_description       text,
  p_trust_txn_type        text,
  p_trust_description      text,
  p_initiated_by          text,
  p_created_by            uuid,
  p_property_id           uuid,
  p_unit_id               uuid,
  p_reference             text,
  p_effective_rate_percent numeric,
  p_rate_config_id        uuid,
  p_statement_month       date,
  p_is_opening_balance    boolean DEFAULT false,  -- step-2 callers omit → false
  p_trust_reference       text    DEFAULT NULL    -- trust_transactions.reference (import migration ref)
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_dep_id uuid;
BEGIN
  INSERT INTO deposit_transactions (
    org_id, lease_id, tenant_id, transaction_type, direction, amount_cents, description,
    created_by, reference, effective_rate_percent, rate_config_id
  ) VALUES (
    p_org_id, p_lease_id, p_tenant_id, p_dep_txn_type, 'credit', p_amount_cents, p_dep_description,
    p_created_by, p_reference, p_effective_rate_percent, p_rate_config_id
  ) RETURNING id INTO v_dep_id;

  INSERT INTO trust_transactions (
    org_id, transaction_type, direction, amount_cents, description,
    property_id, unit_id, lease_id, statement_month, created_by, source, initiated_by,
    is_opening_balance, reference
  ) VALUES (
    p_org_id, p_trust_txn_type, 'credit', p_amount_cents, p_trust_description,
    p_property_id, p_unit_id, p_lease_id, p_statement_month, p_created_by, 'agency_bank', p_initiated_by,
    p_is_opening_balance, p_trust_reference
  );

  RETURN v_dep_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_deposit_atomic(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid,uuid,text,numeric,uuid,date,boolean,text) FROM PUBLIC, anon, authenticated;

-- Kill-between-writes probe for apply_invoice_payment_atomic (CD step-1 gate): forces the trust insert
-- (2nd write) to fail via a signed-off period, asserts the invoice-status update (1st write) rolled back.
CREATE OR REPLACE FUNCTION verify_apply_invoice_payment_atomicity()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_inv rent_invoices%ROWTYPE; v_bank uuid; v_before bigint; v_after bigint;
BEGIN
  SELECT * INTO v_inv FROM rent_invoices WHERE balance_cents > 0 ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'SKIP: no open invoice'; END IF;
  SELECT id INTO v_bank FROM bank_accounts WHERE org_id = v_inv.org_id LIMIT 1;
  IF v_bank IS NULL THEN RETURN 'SKIP: no bank_account for org'; END IF;
  v_before := v_inv.balance_cents;
  BEGIN
    INSERT INTO trust_reconciliation_periods (org_id, bank_account_id, period_start, period_end,
      bank_closing_balance_cents, ledger_closing_balance_cents, recon_computed_closing_cents, status)
    VALUES (v_inv.org_id, v_bank, date_trunc('month', CURRENT_DATE)::date,
      (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date, 0, 0, 0, 'signed_off');
    PERFORM apply_invoice_payment_atomic(v_inv.org_id, v_inv.id, 1, CURRENT_DATE, 'eft', 'atomicity-probe', NULL);
    RAISE EXCEPTION 'probe-did-not-fail';
  EXCEPTION WHEN others THEN NULL; END;
  SELECT balance_cents INTO v_after FROM rent_invoices WHERE id = v_inv.id;
  IF v_after = v_before THEN
    RETURN 'PASS: invoice balance unchanged when trust posting failed (balance=' || v_before || ')';
  END IF;
  RETURN 'FAIL: invoice mutated despite trust failure (before=' || v_before || ' after=' || v_after || ')';
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_apply_invoice_payment_atomicity() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §  SECURITY 2026-07-07: rent_invoices one-per-lease-per-period (kills the double-invoice race)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The invoice-generate cron dedups by (lease_id, period_from) with a SELECT-then-INSERT. Two concurrent runs
-- (daily-orchestrator overlap or a manual re-trigger racing the schedule) can both pass the existence check and
-- INSERT — double-invoicing the tenant. A unique index makes it structurally impossible AND lets the cron do
-- INSERT … ON CONFLICT (lease_id, period_from) DO NOTHING. A PLAIN (non-partial) unique index is used so it can
-- serve as the ON CONFLICT arbiter; ad-hoc invoices with period_from IS NULL stay unconstrained anyway, because
-- Postgres treats NULLs as DISTINCT in a unique index (multiple (lease, NULL) rows are allowed). Only the
-- recurring rent invoices (which always set period_from) are enforced one-per-period.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rent_invoices_lease_period
  ON rent_invoices(lease_id, period_from);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §  SECURITY 2026-07-07: deposit-interest accrual — fold the last_accrued watermark
--     advance INTO record_deposit_atomic (ledger 4c — kills the double-accrual gap)
-- ═══════════════════════════════════════════════════════════════════════════════
-- accrueDepositInterest posted interest via record_deposit_atomic and THEN advanced
-- leases.deposit_interest_last_accrued_date in a SEPARATE statement (step-2 left it "out of
-- scope, post-commit in the caller"). Two failure modes double-accrue the SAME window:
--   (1) crash/error between the RPC commit and the watermark UPDATE → next run re-posts;
--   (2) two concurrent runs (monthly cron overlapping a manual/lease-end accrual) both read the
--       stale watermark, both compute the same window, both post.
-- Fix: the RPC that already owns both ledgers now owns the watermark too. Two new OPTIONAL params
-- (interest callers set them; deposit-received / opening-balance callers omit → NULL → unchanged
-- behaviour). When advancing, we SELECT … FOR UPDATE the lease (serialises concurrent accruals)
-- and compare-and-set: if the watermark already moved off the value the caller read, the window was
-- already accrued elsewhere → RAISE rolls back the ledger posts too (no double-post). IS DISTINCT
-- FROM handles the first-ever accrual (NULL watermark) correctly.
DROP FUNCTION IF EXISTS record_deposit_atomic(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid,uuid,text,numeric,uuid,date,boolean,text);
CREATE OR REPLACE FUNCTION record_deposit_atomic(
  p_org_id                uuid,
  p_lease_id              uuid,
  p_tenant_id             uuid,
  p_amount_cents          bigint,
  p_dep_txn_type          text,
  p_dep_description       text,
  p_trust_txn_type        text,
  p_trust_description      text,
  p_initiated_by          text,
  p_created_by            uuid,
  p_property_id           uuid,
  p_unit_id               uuid,
  p_reference             text,
  p_effective_rate_percent numeric,
  p_rate_config_id        uuid,
  p_statement_month       date,
  p_is_opening_balance    boolean DEFAULT false,  -- step-2 callers omit → false
  p_trust_reference       text    DEFAULT NULL,   -- trust_transactions.reference (import migration ref)
  p_advance_last_accrued_to date  DEFAULT NULL,   -- interest callers only: advance the watermark atomically
  p_expected_last_accrued   date  DEFAULT NULL    -- CAS guard: the watermark value the caller read
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_dep_id uuid; v_current_accrued date;
BEGIN
  -- Deposit-interest accrual: lock the lease + compare-and-set the watermark BEFORE posting, so
  -- concurrent accruals serialise and a duplicate window aborts the whole transaction.
  IF p_advance_last_accrued_to IS NOT NULL THEN
    SELECT deposit_interest_last_accrued_date INTO v_current_accrued
      FROM leases WHERE id = p_lease_id FOR UPDATE;
    IF v_current_accrued IS DISTINCT FROM p_expected_last_accrued THEN
      -- Deterministic duplicate-window rejection (NOT a transient conflict): default P0001 so PostgREST
      -- returns it immediately. A retryable code (40001) would be re-run and re-fail forever.
      RAISE EXCEPTION 'record_deposit_atomic: deposit-interest watermark moved for lease % (expected %, found %) — window already accrued',
        p_lease_id, p_expected_last_accrued, v_current_accrued;
    END IF;
  END IF;

  INSERT INTO deposit_transactions (
    org_id, lease_id, tenant_id, transaction_type, direction, amount_cents, description,
    created_by, reference, effective_rate_percent, rate_config_id
  ) VALUES (
    p_org_id, p_lease_id, p_tenant_id, p_dep_txn_type, 'credit', p_amount_cents, p_dep_description,
    p_created_by, p_reference, p_effective_rate_percent, p_rate_config_id
  ) RETURNING id INTO v_dep_id;

  INSERT INTO trust_transactions (
    org_id, transaction_type, direction, amount_cents, description,
    property_id, unit_id, lease_id, statement_month, created_by, source, initiated_by,
    is_opening_balance, reference
  ) VALUES (
    p_org_id, p_trust_txn_type, 'credit', p_amount_cents, p_trust_description,
    p_property_id, p_unit_id, p_lease_id, p_statement_month, p_created_by, 'agency_bank', p_initiated_by,
    p_is_opening_balance, p_trust_reference
  );

  -- Advance the watermark inside the same transaction as the posts (was a separate post-commit UPDATE).
  IF p_advance_last_accrued_to IS NOT NULL THEN
    UPDATE leases SET deposit_interest_last_accrued_date = p_advance_last_accrued_to WHERE id = p_lease_id;
  END IF;

  RETURN v_dep_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_deposit_atomic(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid,uuid,text,numeric,uuid,date,boolean,text,date,date) FROM PUBLIC, anon, authenticated;
