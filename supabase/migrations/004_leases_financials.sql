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
  -- DebiCheck
  debicheck_mandate_id  text,
  debicheck_mandate_status text CHECK (debicheck_mandate_status IN (
                              'not_created', 'pending', 'active', 'cancelled'
                            )) DEFAULT 'not_created',
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
                    'eft', 'debicheck', 'cash', 'card', 'bank_recon_matched'
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

-- DebiCheck mandates (from 013)
CREATE TABLE IF NOT EXISTS debicheck_mandates (
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

-- DebiCheck collections (from 013)
CREATE TABLE IF NOT EXISTS debicheck_collections (
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

-- DebiCheck
CREATE INDEX IF NOT EXISTS idx_debicheck_org ON debicheck_mandates(org_id);
CREATE INDEX IF NOT EXISTS idx_debicheck_lease ON debicheck_mandates(lease_id);
CREATE INDEX IF NOT EXISTS idx_debicheck_status ON debicheck_mandates(status);
CREATE INDEX IF NOT EXISTS idx_collections_mandate ON debicheck_collections(mandate_id);
CREATE INDEX IF NOT EXISTS idx_collections_lease ON debicheck_collections(lease_id);
CREATE INDEX IF NOT EXISTS idx_collections_status ON debicheck_collections(status);
CREATE INDEX IF NOT EXISTS idx_collections_date ON debicheck_collections(collection_date);

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
    org_id IS NULL OR org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Leases
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_leases" ON leases;
CREATE POLICY "org_leases" ON leases
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_lease" ON leases;
CREATE POLICY "tenant_own_lease" ON leases
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
    AND status IN ('active', 'notice', 'month_to_month')
  );

-- Lease amendments
ALTER TABLE lease_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_amendments" ON lease_amendments;
CREATE POLICY "org_lease_amendments" ON lease_amendments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Lease lifecycle events
ALTER TABLE lease_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lifecycle_events_select" ON lease_lifecycle_events;
CREATE POLICY "org_lifecycle_events_select" ON lease_lifecycle_events
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_lifecycle_events_insert" ON lease_lifecycle_events;
CREATE POLICY "org_lifecycle_events_insert" ON lease_lifecycle_events
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Lease renewal offers
ALTER TABLE lease_renewal_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_renewal_offers" ON lease_renewal_offers;
CREATE POLICY "org_renewal_offers" ON lease_renewal_offers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Org lease clause defaults
ALTER TABLE org_lease_clause_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_clause_defaults" ON org_lease_clause_defaults;
CREATE POLICY "org_clause_defaults" ON org_lease_clause_defaults
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Lease clause selections
ALTER TABLE lease_clause_selections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_selections" ON lease_clause_selections;
CREATE POLICY "org_lease_selections" ON lease_clause_selections
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Lease charges
ALTER TABLE lease_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_lease_charges" ON lease_charges;
CREATE POLICY "org_lease_charges" ON lease_charges
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Trust transactions
ALTER TABLE trust_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_trust_tx_select" ON trust_transactions;
CREATE POLICY "org_trust_tx_select" ON trust_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_trust_tx_insert" ON trust_transactions;
CREATE POLICY "org_trust_tx_insert" ON trust_transactions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Rent invoices
ALTER TABLE rent_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_rent_invoices" ON rent_invoices;
CREATE POLICY "org_rent_invoices" ON rent_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_invoices" ON rent_invoices;
CREATE POLICY "tenant_own_invoices" ON rent_invoices
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );

-- Payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_payments" ON payments;
CREATE POLICY "org_payments" ON payments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_payments" ON payments;
CREATE POLICY "tenant_own_payments" ON payments
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );

-- Management fee invoices
ALTER TABLE management_fee_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_mgmt_fee_invoices" ON management_fee_invoices;
CREATE POLICY "org_mgmt_fee_invoices" ON management_fee_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Property annual summaries
ALTER TABLE property_annual_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_annual_summaries" ON property_annual_summaries;
CREATE POLICY "org_annual_summaries" ON property_annual_summaries
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Owner statements
ALTER TABLE owner_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_owner_statements" ON owner_statements;
CREATE POLICY "org_owner_statements" ON owner_statements
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Deposit timers
ALTER TABLE deposit_timers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deposit_timers" ON deposit_timers;
CREATE POLICY "org_deposit_timers" ON deposit_timers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Deposit deduction items
ALTER TABLE deposit_deduction_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deduction_items" ON deposit_deduction_items;
CREATE POLICY "org_deduction_items" ON deposit_deduction_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Deposit transactions
ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deposit_txns_select" ON deposit_transactions;
CREATE POLICY "org_deposit_txns_select" ON deposit_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_deposit_txns_insert" ON deposit_transactions;
CREATE POLICY "org_deposit_txns_insert" ON deposit_transactions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Deposit reconciliations
ALTER TABLE deposit_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_deposit_recons" ON deposit_reconciliations;
CREATE POLICY "org_deposit_recons" ON deposit_reconciliations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears cases
ALTER TABLE arrears_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears" ON arrears_cases;
CREATE POLICY "org_arrears" ON arrears_cases
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears sequences
ALTER TABLE arrears_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears_sequences" ON arrears_sequences;
CREATE POLICY "org_arrears_sequences" ON arrears_sequences
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears sequence steps
ALTER TABLE arrears_sequence_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears_steps" ON arrears_sequence_steps;
CREATE POLICY "org_arrears_steps" ON arrears_sequence_steps
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears actions
ALTER TABLE arrears_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_arrears_actions_read" ON arrears_actions;
CREATE POLICY "org_arrears_actions_read" ON arrears_actions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_arrears_actions_insert" ON arrears_actions;
CREATE POLICY "org_arrears_actions_insert" ON arrears_actions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears interest charges
ALTER TABLE arrears_interest_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_interest_charges_select" ON arrears_interest_charges;
CREATE POLICY "org_interest_charges_select" ON arrears_interest_charges
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_interest_charges_insert" ON arrears_interest_charges;
CREATE POLICY "org_interest_charges_insert" ON arrears_interest_charges
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_interest_charges_waive" ON arrears_interest_charges;
CREATE POLICY "org_interest_charges_waive" ON arrears_interest_charges
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Bank statement imports
ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_bank_imports" ON bank_statement_imports;
CREATE POLICY "org_bank_imports" ON bank_statement_imports
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Bank statement lines
ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_stmt_lines" ON bank_statement_lines;
CREATE POLICY "org_stmt_lines" ON bank_statement_lines
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- DebiCheck mandates
ALTER TABLE debicheck_mandates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_mandates" ON debicheck_mandates;
CREATE POLICY "org_mandates" ON debicheck_mandates
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_mandate" ON debicheck_mandates;
CREATE POLICY "tenant_own_mandate" ON debicheck_mandates
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );

-- DebiCheck collections
ALTER TABLE debicheck_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_collections" ON debicheck_collections;
CREATE POLICY "org_collections" ON debicheck_collections
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Tenant bank accounts
ALTER TABLE tenant_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_tenant_bank" ON tenant_bank_accounts;
CREATE POLICY "org_tenant_bank" ON tenant_bank_accounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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

DROP TRIGGER IF EXISTS update_debicheck_mandates_updated_at ON debicheck_mandates;
CREATE TRIGGER update_debicheck_mandates_updated_at
  BEFORE UPDATE ON debicheck_mandates
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
