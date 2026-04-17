-- 005_operations.sql
-- Maintenance, supplier invoices, applications, municipal, HOA, reports, imports
-- Depends on: 001_foundation, 002_contacts, 003_properties, 004_leases

-- =============================================================
-- MAINTENANCE: Contractors
-- =============================================================
CREATE TABLE IF NOT EXISTS contractors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  contact_id      uuid NOT NULL REFERENCES contacts(id),

  -- Contractor-specific fields
  specialities    text[] DEFAULT '{}',
  property_ids    uuid[] DEFAULT '{}',
  call_out_rate_cents integer,
  hourly_rate_cents   integer,

  -- Contractor portal access
  portal_access_enabled boolean DEFAULT false,
  portal_invite_sent_at timestamptz,
  access_token    text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  auth_user_id    uuid REFERENCES auth.users(id),
  notification_email boolean DEFAULT true,
  notification_sms   boolean DEFAULT false,
  portal_language    text DEFAULT 'en',

  -- Heritage (from 017)
  heritage_approved     boolean DEFAULT false,
  heritage_specialities text[] DEFAULT '{}',

  -- Supplier extension
  supplier_type   text DEFAULT 'contractor'
                  CHECK (supplier_type IN ('contractor', 'recurring', 'both')),
  vat_registered  boolean DEFAULT false,
  banking_name    text,
  bank_name       text,
  bank_account_number text,
  bank_branch_code    text,
  bank_account_type   text
                  CHECK (bank_account_type IN ('cheque', 'savings', 'transmission')),

  -- Audit
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, contact_id)
);

-- =============================================================
-- MAINTENANCE: Contractor preferences
-- =============================================================
CREATE TABLE IF NOT EXISTS contractor_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid REFERENCES properties(id),
  building_id     uuid REFERENCES buildings(id),
  category        text NOT NULL,
  contractor_id   uuid NOT NULL REFERENCES contractors(id),
  priority_order  integer DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, property_id, category, priority_order)
);

-- =============================================================
-- MAINTENANCE: Maintenance requests
-- =============================================================
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  unit_id           uuid NOT NULL REFERENCES units(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  building_id       uuid REFERENCES buildings(id),
  lease_id          uuid REFERENCES leases(id),
  tenant_id         uuid REFERENCES tenants(id),
  title             text NOT NULL,
  description       text NOT NULL,
  logged_by         text NOT NULL CHECK (logged_by IN ('tenant', 'agent', 'system')),
  logged_by_user    uuid REFERENCES auth.users(id),
  category          text CHECK (category IN (
                      'electrical', 'plumbing', 'hvac', 'structural', 'roofing',
                      'windows_doors', 'appliances', 'garden', 'pest_control',
                      'painting', 'flooring', 'security', 'access_control',
                      'cleaning', 'other'
                    )),
  urgency           text CHECK (urgency IN ('emergency', 'urgent', 'routine', 'cosmetic')),
  ai_triage_notes   text,
  ai_triage_at      timestamptz,
  category_override text,
  urgency_override  text,
  status            text NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN (
                      'pending_review', 'approved', 'pending_landlord',
                      'landlord_approved', 'landlord_rejected', 'rejected',
                      'work_order_sent', 'acknowledged', 'in_progress',
                      'pending_completion', 'completed', 'tenant_notified',
                      'closed', 'cancelled'
                    )),
  reviewed_by       uuid REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  landlord_notified_at      timestamptz,
  landlord_approved_by      text,
  landlord_approved_at      timestamptz,
  landlord_rejection_reason text,
  work_order_number text UNIQUE,
  contractor_id     uuid REFERENCES contractors(id),
  work_order_sent_at  timestamptz,
  work_order_pdf_path text,
  access_instructions  text,
  special_instructions text,
  scheduled_date      date,
  scheduled_time_from time,
  scheduled_time_to   time,
  tenant_notified_of_schedule boolean DEFAULT false,
  estimated_cost_cents   integer,
  quoted_cost_cents      integer,
  actual_cost_cents      integer,
  approval_threshold_cents integer,
  invoice_storage_path   text,
  completed_at      timestamptz,
  completion_notes  text,
  agent_signoff_at  timestamptz,
  agent_signoff_by  uuid REFERENCES auth.users(id),
  tenant_rating     integer CHECK (tenant_rating BETWEEN 1 AND 5),
  tenant_feedback   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- MAINTENANCE: Maintenance photos
-- =============================================================
CREATE TABLE IF NOT EXISTS maintenance_photos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL,
  request_id             uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  storage_path           text NOT NULL,
  storage_path_thumb     text,
  caption                text,
  uploaded_by_type       text CHECK (uploaded_by_type IN ('tenant', 'agent', 'contractor')),
  uploaded_by_user       uuid REFERENCES auth.users(id),
  uploaded_by_contractor uuid REFERENCES contractors(id),
  photo_phase            text NOT NULL DEFAULT 'before'
                         CHECK (photo_phase IN ('before', 'during', 'after')),
  gps_lat                numeric(10,7),
  gps_lng                numeric(10,7),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- MAINTENANCE: Contractor updates (immutable)
-- =============================================================
CREATE TABLE IF NOT EXISTS contractor_updates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  request_id    uuid NOT NULL REFERENCES maintenance_requests(id),
  contractor_id uuid NOT NULL REFERENCES contractors(id),
  new_status    text NOT NULL,
  notes         text,
  eta           timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- MAINTENANCE: Maintenance quotes
-- =============================================================
CREATE TABLE IF NOT EXISTS maintenance_quotes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  request_id            uuid NOT NULL REFERENCES maintenance_requests(id),
  contractor_id         uuid NOT NULL REFERENCES contractors(id),
  quote_type            text NOT NULL DEFAULT 'quote'
                        CHECK (quote_type IN ('quote', 'estimate')),
  quote_number          text,
  line_items            jsonb NOT NULL DEFAULT '[]',
  subtotal_excl_vat_cents integer NOT NULL,
  vat_amount_cents        integer NOT NULL DEFAULT 0,
  total_incl_vat_cents    integer NOT NULL,
  valid_until           date,
  estimated_duration    text,
  scope_of_work         text,
  exclusions            text,
  materials_included    boolean DEFAULT true,
  call_out_included     boolean DEFAULT true,
  contractor_notes      text,
  quote_pdf_path        text,
  status                text NOT NULL DEFAULT 'submitted'
                        CHECK (status IN (
                          'draft', 'submitted', 'approved', 'rejected', 'superseded', 'expired'
                        )),
  reviewed_by           uuid REFERENCES auth.users(id),
  reviewed_at           timestamptz,
  rejection_reason      text,
  landlord_approval_required boolean DEFAULT false,
  landlord_approved_at  timestamptz,
  landlord_rejected_at  timestamptz,
  submitted_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- SUPPLIER INVOICES: Supplier schedules
-- =============================================================
CREATE TABLE IF NOT EXISTS supplier_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  contractor_id   uuid NOT NULL REFERENCES contractors(id),
  property_id     uuid REFERENCES properties(id),
  unit_id         uuid REFERENCES units(id),
  description     text NOT NULL,
  category        text NOT NULL,
  frequency       text NOT NULL CHECK (frequency IN (
                    'weekly', 'monthly', 'quarterly', 'bi_annual', 'annual', 'ad_hoc'
                  )),
  expected_amount_cents integer,
  next_due_date   date,
  is_active       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- SUPPLIER INVOICES: Supplier invoices
-- =============================================================
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  contractor_id       uuid REFERENCES contractors(id),
  maintenance_request_id uuid REFERENCES maintenance_requests(id),
  schedule_id         uuid REFERENCES supplier_schedules(id),
  property_id         uuid REFERENCES properties(id),
  building_id         uuid REFERENCES buildings(id),
  unit_id             uuid REFERENCES units(id),
  invoice_number      text,
  invoice_date        date NOT NULL,
  due_date            date,
  description         text NOT NULL,
  amount_excl_vat_cents integer NOT NULL,
  vat_amount_cents    integer NOT NULL DEFAULT 0,
  amount_incl_vat_cents integer NOT NULL,
  payment_source      text NOT NULL DEFAULT 'trust'
                      CHECK (payment_source IN ('trust', 'agency', 'owner_direct')),
  owner_id            uuid,
  trust_account_id    uuid,
  status              text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN (
                        'submitted', 'under_review', 'approved', 'pending_payment',
                        'paid', 'rejected', 'disputed', 'owner_direct_recorded'
                      )),
  reviewed_by         uuid REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  rejection_reason    text,
  dispute_notes       text,
  paid_at             timestamptz,
  paid_by             uuid REFERENCES auth.users(id),
  payment_reference   text,
  payment_notes       text,
  invoice_storage_path text,
  ai_extracted        boolean DEFAULT false,
  ai_extracted_data   jsonb,
  include_on_statement boolean DEFAULT true,
  statement_month     date,
  statement_line_description text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- APPLICATIONS: Listings
-- =============================================================
CREATE TABLE IF NOT EXISTS listings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  unit_id               uuid NOT NULL REFERENCES units(id),
  property_id           uuid NOT NULL REFERENCES properties(id),
  asking_rent_cents     integer NOT NULL,
  available_from        date,
  description           text,
  requirements          text,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','active','paused','filled','expired')),
  application_fee_cents integer NOT NULL DEFAULT 39900,
  required_documents    text[] DEFAULT '{"id_document","payslip_x3","bank_statement_x3","employment_letter"}',
  pet_friendly          boolean DEFAULT false,
  listing_photos        text[] DEFAULT '{}',
  listing_notes         text,
  min_income_multiple   numeric(4,2) DEFAULT 3.33,
  views_count           integer DEFAULT 0,
  applications_count    integer DEFAULT 0,
  filled_at             timestamptz,
  filled_with_application_id uuid,
  public_slug           text UNIQUE,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- APPLICATIONS: Applications (two-stage model)
-- =============================================================
CREATE TABLE IF NOT EXISTS applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  listing_id            uuid NOT NULL REFERENCES listings(id),
  unit_id               uuid NOT NULL REFERENCES units(id),

  -- Credit report reuse (from 028)
  reused_from_application_id uuid,

  -- Applicant identity
  applicant_email       text NOT NULL,
  applicant_phone       text,
  first_name            text,
  last_name             text,
  id_number             text,
  id_number_hash        text,
  id_type               text CHECK (id_type IN ('sa_id','passport','asylum_permit')),
  date_of_birth         date,

  -- Employment
  employer_name         text,
  employment_type       text CHECK (employment_type IN (
                          'permanent','contract','self_employed',
                          'student','unemployed','retired','other'
                        )),
  gross_monthly_income_cents integer,

  -- Motivation field
  applicant_motivation      text,
  motivation_doc_path       text,
  motivation_doc_type       text,
  motivation_submitted_at   timestamptz,

  -- Foreign national fields
  is_foreign_national   boolean DEFAULT false,
  applicant_nationality_type text DEFAULT 'sa_citizen'
    CHECK (applicant_nationality_type IN (
      'sa_citizen','sa_permanent_resident','foreign_work_permit',
      'foreign_study_permit','foreign_business_permit','foreign_retired_permit',
      'foreign_other_permit','naturalising','asylum_seeker'
    )),
  permit_type           text,
  permit_number         text,
  permit_expiry_date    date,
  permit_doc_path       text,
  permit_verified       boolean DEFAULT false,
  permit_verified_by    uuid REFERENCES auth.users(id),
  permit_verified_at    timestamptz,
  nationality           text,
  passport_number       text,
  passport_expiry_date  date,
  tpn_listing_limited   boolean DEFAULT false,
  higher_deposit_recommended boolean DEFAULT false,
  has_guarantor         boolean DEFAULT false,

  -- Joint application
  has_co_applicant          boolean DEFAULT false,
  co_applicants_count       integer DEFAULT 0,
  combined_income_cents     integer,
  combined_affordability_ratio numeric(5,4),
  combined_prescreen_score  integer,
  joint_fee_paid            boolean DEFAULT false,
  joint_fee_amount_cents    integer,
  joint_payfast_payment_id  text,

  -- Stage 1 status
  stage1_status         text NOT NULL DEFAULT 'pending_documents'
                        CHECK (stage1_status IN (
                          'pending_documents','documents_submitted','extracting',
                          'pre_screen_complete','shortlisted','not_shortlisted'
                        )),
  stage1_consent_given      boolean DEFAULT false,
  stage1_consent_given_at   timestamptz,
  stage1_consent_ip         inet,
  stage1_consent_log_id     uuid,

  -- Bank statement analysis (Stage 1)
  bank_statement_path       text,
  bank_statement_extracted  jsonb,
  bank_statement_status     text DEFAULT 'not_uploaded'
                            CHECK (bank_statement_status IN (
                              'not_uploaded','pending','extracted','confirmed'
                            )),

  -- Pre-screen partial score (Stage 1)
  prescreen_score           integer,
  prescreen_income_score    integer,
  prescreen_employment_score integer,
  prescreen_refs_score      integer,
  prescreen_affordability_flag boolean DEFAULT false,

  -- Stage 1 agent review
  agent_prescreen_notes     text,
  prescreened_by            uuid REFERENCES auth.users(id),
  prescreened_at            timestamptz,
  not_shortlisted_reason    text,

  -- Stage 2 status
  stage2_status         text DEFAULT NULL
                        CHECK (stage2_status IN (
                          'invited','pending_consent','pending_payment',
                          'payment_received','screening_in_progress',
                          'screening_complete','approved','declined','withdrawn'
                        )),
  stage2_consent_given      boolean DEFAULT false,
  stage2_consent_given_at   timestamptz,
  stage2_consent_ip         inet,
  stage2_consent_log_id     uuid,

  -- Stage 2 payment
  fee_status            text DEFAULT 'not_applicable'
                        CHECK (fee_status IN (
                          'not_applicable','pending','paid','refunded'
                        )),
  fee_amount_cents      integer DEFAULT 39900,
  fee_paid_at           timestamptz,
  payfast_payment_id    text,

  -- Searchworx (Stage 2)
  searchworx_check_id       text,
  searchworx_extracted_data jsonb,
  searchworx_check_status   text DEFAULT 'not_run'
                            CHECK (searchworx_check_status IN (
                              'not_run','pending','complete','failed'
                            )),
  searchworx_checked_at     timestamptz,

  -- Full FitScore (Stage 2)
  fitscore                  integer CHECK (fitscore BETWEEN 0 AND 100),
  fitscore_components       jsonb,
  fitscore_calculated_at    timestamptz,
  fitscore_summary          text,
  fitscore_summary_at       timestamptz,

  -- Documents
  documents_submitted       text[] DEFAULT '{}',

  -- Agent final review
  agent_notes               text,
  reviewed_by               uuid REFERENCES auth.users(id),
  reviewed_at               timestamptz,
  decline_reason            text,

  -- If approved -> tenant created
  tenant_id                 uuid REFERENCES tenants(id),

  -- Waitlist
  waitlist_priority         integer DEFAULT 999,

  -- Immigration compliance gate
  immigration_compliance_confirmed boolean DEFAULT false,
  immigration_compliance_confirmed_by uuid REFERENCES auth.users(id),
  immigration_compliance_confirmed_at timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Self-referencing FK for credit report reuse (deferred to avoid forward reference)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'applications'
      AND constraint_name = 'fk_applications_reused_from'
  ) THEN
    ALTER TABLE applications ADD CONSTRAINT fk_applications_reused_from
      FOREIGN KEY (reused_from_application_id) REFERENCES applications(id);
  END IF;
END $$;

-- =============================================================
-- APPLICATIONS: Access tokens
-- =============================================================
CREATE TABLE IF NOT EXISTS application_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  token_type      text NOT NULL DEFAULT 'application'
                  CHECK (token_type IN ('application','shortlist_invite')),
  applicant_email text NOT NULL,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '30 days',
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- APPLICATIONS: Co-applicants
-- =============================================================
CREATE TABLE IF NOT EXISTS application_co_applicants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  primary_application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  co_applicant_index    integer NOT NULL DEFAULT 1,
  first_name            text,
  last_name             text,
  applicant_email       text NOT NULL,
  applicant_phone       text,
  id_number             text,
  id_number_hash        text,
  id_type               text CHECK (id_type IN ('sa_id','passport','asylum_permit')),
  date_of_birth         date,
  employer_name         text,
  employment_type       text CHECK (employment_type IN (
                          'permanent','contract','self_employed',
                          'student','unemployed','retired','other'
                        )),
  gross_monthly_income_cents integer,
  documents_submitted   text[] DEFAULT '{}',
  bank_statement_path   text,
  bank_statement_extracted jsonb,
  bank_statement_status text DEFAULT 'not_uploaded'
                        CHECK (bank_statement_status IN (
                          'not_uploaded','pending','extracted','confirmed'
                        )),
  applicant_motivation  text,
  motivation_doc_path   text,
  stage1_consent_given      boolean DEFAULT false,
  stage1_consent_given_at   timestamptz,
  stage1_consent_ip         inet,
  stage1_consent_log_id     uuid,
  stage2_consent_given      boolean DEFAULT false,
  stage2_consent_given_at   timestamptz,
  stage2_consent_ip         inet,
  stage2_consent_log_id     uuid,
  searchworx_check_id       text,
  searchworx_extracted_data jsonb,
  searchworx_check_status   text DEFAULT 'not_run',
  searchworx_checked_at     timestamptz,
  prescreen_income_score    integer,
  prescreen_employment_score integer,
  prescreen_affordability_flag boolean DEFAULT false,
  access_token          text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  access_token_expires  timestamptz DEFAULT now() + interval '30 days',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- APPLICATIONS: Guarantors
-- =============================================================
CREATE TABLE IF NOT EXISTS application_guarantors (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  application_id        uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  email                 text,
  phone                 text,
  relationship_to_applicant text,
  nationality_type      text CHECK (nationality_type IN (
                          'sa_citizen','sa_permanent_resident','foreign_national'
                        )),
  id_number             text,
  id_type               text CHECK (id_type IN ('sa_id','passport')),
  nationality           text,
  documents_submitted   text[] DEFAULT '{}',
  financial_capacity_summary text,
  guarantor_agreement_path text,
  guarantor_agreement_signed_at timestamptz,
  searchworx_check_id   text,
  searchworx_extracted_data jsonb,
  searchworx_check_status text DEFAULT 'not_run',
  access_token          text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  access_token_expires  timestamptz DEFAULT now() + interval '30 days',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- APPLICATIONS: Additional financial documents
-- =============================================================
CREATE TABLE IF NOT EXISTS application_additional_docs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  application_id    uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  doc_type          text NOT NULL CHECK (doc_type IN (
                      'savings_account','investment_portfolio',
                      'pension_statement','guarantor_letter',
                      'property_sale_agreement','trust_income',
                      'rental_income','other_income'
                    )),
  storage_path      text NOT NULL,
  original_filename text,
  extracted_data    jsonb,
  extracted_at      timestamptz,
  extraction_status text DEFAULT 'pending'
                    CHECK (extraction_status IN ('pending','extracted','failed')),
  display_summary   text,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  uploaded_by_applicant_index integer DEFAULT 0
);

-- =============================================================
-- MUNICIPAL: Municipal accounts
-- =============================================================
CREATE TABLE IF NOT EXISTS municipal_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  account_number    text NOT NULL,
  municipality_name text NOT NULL,
  municipality_code text,
  service_address   text,
  account_holder    text,
  includes_rates        boolean DEFAULT true,
  includes_water        boolean DEFAULT true,
  includes_electricity  boolean DEFAULT false,
  includes_refuse       boolean DEFAULT true,
  includes_sewerage     boolean DEFAULT true,
  electricity_prepaid   boolean DEFAULT false,
  billing_day           integer,
  is_active             boolean DEFAULT true,
  notes                 text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- MUNICIPAL: Municipal bills
-- =============================================================
CREATE TABLE IF NOT EXISTS municipal_bills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  property_id         uuid NOT NULL REFERENCES properties(id),
  municipal_account_id uuid NOT NULL REFERENCES municipal_accounts(id),
  pdf_storage_path    text NOT NULL,
  original_filename   text,
  file_size_bytes     integer,
  billing_period_from date,
  billing_period_to   date,
  billing_month       date,
  due_date            date,
  extraction_status   text NOT NULL DEFAULT 'pending'
                      CHECK (extraction_status IN (
                        'pending', 'extracting', 'extracted',
                        'needs_review', 'confirmed', 'failed'
                      )),
  extracted_at        timestamptz,
  extraction_confidence numeric(3,2),
  extraction_notes    text,
  charge_rates_cents          integer DEFAULT 0,
  charge_water_cents          integer DEFAULT 0,
  charge_sewerage_cents       integer DEFAULT 0,
  charge_electricity_cents    integer DEFAULT 0,
  charge_refuse_cents         integer DEFAULT 0,
  charge_vat_cents            integer DEFAULT 0,
  charge_levies_cents         integer DEFAULT 0,
  charge_penalties_cents      integer DEFAULT 0,
  charge_other_cents          integer DEFAULT 0,
  total_current_charges_cents integer DEFAULT 0,
  previous_balance_cents      integer DEFAULT 0,
  payments_received_cents     integer DEFAULT 0,
  total_amount_due_cents      integer DEFAULT 0,
  arrears_cents               integer DEFAULT 0,
  water_reading_previous      numeric(10,3),
  water_reading_current       numeric(10,3),
  water_consumption_kl        numeric(10,3),
  electricity_reading_previous numeric(10,3),
  electricity_reading_current  numeric(10,3),
  electricity_consumption_kwh  numeric(10,3),
  agent_confirmed         boolean DEFAULT false,
  confirmed_by            uuid REFERENCES auth.users(id),
  confirmed_at            timestamptz,
  agent_notes             text,
  payment_status          text NOT NULL DEFAULT 'unpaid'
                          CHECK (payment_status IN ('unpaid', 'paid', 'partial', 'overdue')),
  paid_at                 timestamptz,
  payment_reference       text,
  supplier_invoice_id     uuid,
  allocation_status       text NOT NULL DEFAULT 'unallocated'
                          CHECK (allocation_status IN ('unallocated', 'allocated', 'not_required')),
  uploaded_by             uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- MUNICIPAL: Per-unit allocations
-- =============================================================
CREATE TABLE IF NOT EXISTS municipal_bill_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  bill_id         uuid NOT NULL REFERENCES municipal_bills(id) ON DELETE CASCADE,
  unit_id         uuid NOT NULL REFERENCES units(id),
  building_id     uuid REFERENCES buildings(id),
  lease_id        uuid REFERENCES leases(id),
  tenant_id       uuid REFERENCES tenants(id),
  allocation_method text NOT NULL DEFAULT 'equal_split'
                    CHECK (allocation_method IN (
                      'equal_split', 'occupied_only', 'meter_reading',
                      'floor_area', 'manual'
                    )),
  rates_cents         integer DEFAULT 0,
  water_cents         integer DEFAULT 0,
  sewerage_cents      integer DEFAULT 0,
  electricity_cents   integer DEFAULT 0,
  refuse_cents        integer DEFAULT 0,
  other_cents         integer DEFAULT 0,
  total_cents         integer DEFAULT 0,
  recover_from_tenant   boolean DEFAULT false,
  tenant_invoiced       boolean DEFAULT false,
  tenant_invoice_id     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- HOA: HOA / Body Corporate entity
-- =============================================================
CREATE TABLE IF NOT EXISTS hoa_entities (
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

-- =============================================================
-- HOA: Unit owners
-- =============================================================
CREATE TABLE IF NOT EXISTS hoa_unit_owners (
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

-- =============================================================
-- HOA: Levy schedules
-- =============================================================
CREATE TABLE IF NOT EXISTS levy_schedules (
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

-- =============================================================
-- HOA: Levy unit amounts (cache)
-- =============================================================
CREATE TABLE IF NOT EXISTS levy_unit_amounts (
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

-- =============================================================
-- HOA: Levy invoices
-- =============================================================
CREATE TABLE IF NOT EXISTS levy_invoices (
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

-- =============================================================
-- HOA: AGM records
-- =============================================================
CREATE TABLE IF NOT EXISTS agm_records (
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

-- =============================================================
-- HOA: AGM resolutions
-- =============================================================
CREATE TABLE IF NOT EXISTS agm_resolutions (
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

-- =============================================================
-- HOA: Reserve fund entries (immutable)
-- =============================================================
CREATE TABLE IF NOT EXISTS reserve_fund_entries (
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

-- Deferred FK: levy_schedules.agm_resolution_id -> agm_resolutions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'levy_schedules'
      AND constraint_name = 'fk_levy_agm_resolution'
  ) THEN
    ALTER TABLE levy_schedules ADD CONSTRAINT fk_levy_agm_resolution
      FOREIGN KEY (agm_resolution_id) REFERENCES agm_resolutions(id);
  END IF;
END $$;

-- =============================================================
-- REPORTS: Report configurations
-- =============================================================
CREATE TABLE IF NOT EXISTS report_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  report_type     text NOT NULL CHECK (report_type IN (
                    'portfolio_summary',
                    'occupancy',
                    'income_collection',
                    'arrears_aging',
                    'maintenance_costs',
                    'lease_expiry',
                    'application_pipeline',
                    'owner_portfolio',
                    'rent_roll',
                    'annual_tax_summary'
                  )),
  name            text NOT NULL,
  property_ids    uuid[] DEFAULT '{}',
  period_type     text CHECK (period_type IN (
                    'this_month','last_month','this_quarter',
                    'last_quarter','this_tax_year','last_tax_year',
                    'custom'
                  )),
  is_scheduled    boolean DEFAULT false,
  schedule_day    integer CHECK (schedule_day IS NULL OR (schedule_day >= 1 AND schedule_day <= 28)),
  recipient_emails text[],
  last_sent_at    timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- IMPORT: Import sessions
-- =============================================================
CREATE TABLE IF NOT EXISTS import_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  created_by            uuid NOT NULL REFERENCES auth.users(id),
  import_type           text DEFAULT 'contacts',
  status                text NOT NULL DEFAULT 'mapping'
                        CHECK (status IN (
                          'mapping', 'reviewing', 'importing',
                          'complete', 'partial', 'failed'
                        )),
  source_filename       text,
  source_row_count      int,
  detected_entities     jsonb,
  column_mapping        jsonb,
  extra_column_routing  jsonb,
  conflict_resolutions  jsonb,
  expired_lease_action  text CHECK (expired_lease_action IN (
                          'skip', 'import_as_expired'
                        )),
  per_row_overrides     jsonb,
  rows_imported         int DEFAULT 0,
  rows_skipped          int DEFAULT 0,
  rows_errored          int DEFAULT 0,
  error_report          jsonb,
  discarded_columns     jsonb,
  extra_data            jsonb,
  extra_data_expires_at timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- ALTER: Organisation maintenance threshold
-- =============================================================
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS maintenance_approval_threshold_cents integer DEFAULT 200000;


-- #############################################################
-- INDEXES
-- #############################################################

-- Maintenance
CREATE INDEX IF NOT EXISTS idx_contractors_org_id     ON contractors(org_id);
CREATE INDEX IF NOT EXISTS idx_contractors_contact_id ON contractors(contact_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_org_id     ON maintenance_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_unit_id    ON maintenance_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status     ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_urgency    ON maintenance_requests(urgency);
CREATE INDEX IF NOT EXISTS idx_maintenance_photos_request ON maintenance_photos(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request         ON maintenance_quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_contractor      ON maintenance_quotes(contractor_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status          ON maintenance_quotes(status);

-- Supplier invoices
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_org       ON supplier_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_request   ON supplier_invoices(maintenance_request_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_property  ON supplier_invoices(property_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status    ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_statement_month ON supplier_invoices(statement_month);

-- Applications
CREATE INDEX IF NOT EXISTS idx_listings_org           ON listings(org_id);
CREATE INDEX IF NOT EXISTS idx_listings_unit          ON listings(unit_id);
CREATE INDEX IF NOT EXISTS idx_listings_status        ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_slug          ON listings(public_slug);
CREATE INDEX IF NOT EXISTS idx_applications_org       ON applications(org_id);
CREATE INDEX IF NOT EXISTS idx_applications_listing   ON applications(listing_id);
CREATE INDEX IF NOT EXISTS idx_applications_stage1    ON applications(stage1_status);
CREATE INDEX IF NOT EXISTS idx_applications_stage2    ON applications(stage2_status);
CREATE INDEX IF NOT EXISTS idx_applications_fitscore  ON applications(fitscore DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_app_tokens_token       ON application_tokens(token);
CREATE INDEX IF NOT EXISTS idx_co_applicants_primary  ON application_co_applicants(primary_application_id);
CREATE INDEX IF NOT EXISTS idx_guarantors_application ON application_guarantors(application_id);
CREATE INDEX IF NOT EXISTS idx_additional_docs_application ON application_additional_docs(application_id);

-- Municipal
CREATE INDEX IF NOT EXISTS idx_municipal_accounts_property ON municipal_accounts(property_id);
CREATE INDEX IF NOT EXISTS idx_municipal_accounts_org      ON municipal_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_municipal_bills_property    ON municipal_bills(property_id);
CREATE INDEX IF NOT EXISTS idx_municipal_bills_period      ON municipal_bills(billing_month);
CREATE INDEX IF NOT EXISTS idx_municipal_bills_status      ON municipal_bills(extraction_status);
CREATE INDEX IF NOT EXISTS idx_municipal_allocs_bill       ON municipal_bill_allocations(bill_id);
CREATE INDEX IF NOT EXISTS idx_municipal_allocs_unit       ON municipal_bill_allocations(unit_id);

-- HOA
CREATE INDEX IF NOT EXISTS idx_hoa_org                ON hoa_entities(org_id);
CREATE INDEX IF NOT EXISTS idx_hoa_property           ON hoa_entities(property_id);
CREATE INDEX IF NOT EXISTS idx_hoa_owners_hoa         ON hoa_unit_owners(hoa_id);
CREATE INDEX IF NOT EXISTS idx_hoa_owners_unit        ON hoa_unit_owners(unit_id);
CREATE INDEX IF NOT EXISTS idx_levy_unit_amounts_schedule ON levy_unit_amounts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_levy_unit_amounts_owner    ON levy_unit_amounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_levy_invoices_hoa      ON levy_invoices(hoa_id);
CREATE INDEX IF NOT EXISTS idx_levy_invoices_owner    ON levy_invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_levy_invoices_status   ON levy_invoices(status);
CREATE INDEX IF NOT EXISTS idx_reserve_fund_hoa       ON reserve_fund_entries(hoa_id);

-- Reports
CREATE INDEX IF NOT EXISTS idx_report_configs_org ON report_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_report_configs_scheduled ON report_configs(is_scheduled, schedule_day) WHERE is_scheduled = true;

-- Import
CREATE INDEX IF NOT EXISTS idx_import_sessions_org_id ON import_sessions(org_id);


-- #############################################################
-- ROW LEVEL SECURITY
-- #############################################################

-- Maintenance: contractors
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contractors" ON contractors;
CREATE POLICY "org_contractors" ON contractors
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Maintenance: contractor_preferences
ALTER TABLE contractor_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contractor_prefs" ON contractor_preferences;
CREATE POLICY "org_contractor_prefs" ON contractor_preferences
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Maintenance: maintenance_requests
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_maintenance" ON maintenance_requests;
CREATE POLICY "org_maintenance" ON maintenance_requests
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "tenant_own_requests" ON maintenance_requests;
CREATE POLICY "tenant_own_requests" ON maintenance_requests
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "tenant_create_requests" ON maintenance_requests;
CREATE POLICY "tenant_create_requests" ON maintenance_requests
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
    AND logged_by = 'tenant' AND status = 'pending_review'
  );
DROP POLICY IF EXISTS "contractor_assigned_jobs" ON maintenance_requests;
CREATE POLICY "contractor_assigned_jobs" ON maintenance_requests
  FOR SELECT USING (
    contractor_id IN (
      SELECT id FROM contractors WHERE auth_user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "contractor_update_own_jobs" ON maintenance_requests;
CREATE POLICY "contractor_update_own_jobs" ON maintenance_requests
  FOR UPDATE USING (
    contractor_id IN (
      SELECT id FROM contractors WHERE auth_user_id = auth.uid()
    )
  );

-- Maintenance: maintenance_photos
ALTER TABLE maintenance_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_maintenance_photos" ON maintenance_photos;
CREATE POLICY "org_maintenance_photos" ON maintenance_photos
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Maintenance: contractor_updates
ALTER TABLE contractor_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contractor_updates_read" ON contractor_updates;
CREATE POLICY "org_contractor_updates_read" ON contractor_updates
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Maintenance: maintenance_quotes
ALTER TABLE maintenance_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_quotes" ON maintenance_quotes;
CREATE POLICY "org_quotes" ON maintenance_quotes
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "contractor_own_quotes" ON maintenance_quotes;
CREATE POLICY "contractor_own_quotes" ON maintenance_quotes
  FOR ALL USING (
    contractor_id IN (
      SELECT id FROM contractors WHERE auth_user_id = auth.uid()
    )
  );

-- Supplier: supplier_schedules
ALTER TABLE supplier_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_supplier_schedules" ON supplier_schedules;
CREATE POLICY "org_supplier_schedules" ON supplier_schedules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Supplier: supplier_invoices
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_supplier_invoices" ON supplier_invoices;
CREATE POLICY "org_supplier_invoices" ON supplier_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Applications: listings
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_listings" ON listings;
CREATE POLICY "org_listings" ON listings
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "public_listing_view" ON listings;
CREATE POLICY "public_listing_view" ON listings
  FOR SELECT USING (status = 'active');

-- Applications: applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_applications" ON applications;
CREATE POLICY "org_applications" ON applications
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Applications: application_tokens
ALTER TABLE application_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_app_tokens" ON application_tokens;
CREATE POLICY "org_app_tokens" ON application_tokens
  FOR ALL USING (
    application_id IN (SELECT id FROM applications WHERE org_id IN (
      SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
    ))
  );

-- Applications: co_applicants
ALTER TABLE application_co_applicants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_co_applicants" ON application_co_applicants;
CREATE POLICY "org_co_applicants" ON application_co_applicants
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Applications: guarantors
ALTER TABLE application_guarantors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_guarantors" ON application_guarantors;
CREATE POLICY "org_guarantors" ON application_guarantors
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Applications: additional_docs
ALTER TABLE application_additional_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_additional_docs" ON application_additional_docs;
CREATE POLICY "org_additional_docs" ON application_additional_docs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Municipal: municipal_accounts
ALTER TABLE municipal_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_municipal_accounts" ON municipal_accounts;
CREATE POLICY "org_municipal_accounts" ON municipal_accounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Municipal: municipal_bills
ALTER TABLE municipal_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_municipal_bills" ON municipal_bills;
CREATE POLICY "org_municipal_bills" ON municipal_bills
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Municipal: municipal_bill_allocations
ALTER TABLE municipal_bill_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_municipal_allocs" ON municipal_bill_allocations;
CREATE POLICY "org_municipal_allocs" ON municipal_bill_allocations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: hoa_entities
ALTER TABLE hoa_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_hoa" ON hoa_entities;
CREATE POLICY "org_hoa" ON hoa_entities
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: hoa_unit_owners
ALTER TABLE hoa_unit_owners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_hoa_owners" ON hoa_unit_owners;
CREATE POLICY "org_hoa_owners" ON hoa_unit_owners
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: levy_schedules
ALTER TABLE levy_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_levy_schedules" ON levy_schedules;
CREATE POLICY "org_levy_schedules" ON levy_schedules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: levy_unit_amounts
ALTER TABLE levy_unit_amounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_levy_unit_amounts" ON levy_unit_amounts;
CREATE POLICY "org_levy_unit_amounts" ON levy_unit_amounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: levy_invoices
ALTER TABLE levy_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_levy_invoices" ON levy_invoices;
CREATE POLICY "org_levy_invoices" ON levy_invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: agm_records
ALTER TABLE agm_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_agm" ON agm_records;
CREATE POLICY "org_agm" ON agm_records
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: agm_resolutions
ALTER TABLE agm_resolutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_agm_resolutions" ON agm_resolutions;
CREATE POLICY "org_agm_resolutions" ON agm_resolutions
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- HOA: reserve_fund_entries
ALTER TABLE reserve_fund_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_reserve_select" ON reserve_fund_entries;
CREATE POLICY "org_reserve_select" ON reserve_fund_entries
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "org_reserve_insert" ON reserve_fund_entries;
CREATE POLICY "org_reserve_insert" ON reserve_fund_entries
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Reports: report_configs
ALTER TABLE report_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_report_configs" ON report_configs;
CREATE POLICY "org_report_configs" ON report_configs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Import: import_sessions
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_import_sessions" ON import_sessions;
CREATE POLICY "org_import_sessions" ON import_sessions
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- #############################################################
-- TRIGGERS
-- #############################################################

DROP TRIGGER IF EXISTS update_contractors_updated_at ON contractors;
CREATE TRIGGER update_contractors_updated_at
  BEFORE UPDATE ON contractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_requests_updated_at ON maintenance_requests;
CREATE TRIGGER update_maintenance_requests_updated_at
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_supplier_schedules_updated_at ON supplier_schedules;
CREATE TRIGGER update_supplier_schedules_updated_at
  BEFORE UPDATE ON supplier_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_supplier_invoices_updated_at ON supplier_invoices;
CREATE TRIGGER update_supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_applications_updated_at ON applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_municipal_accounts_updated_at ON municipal_accounts;
CREATE TRIGGER update_municipal_accounts_updated_at
  BEFORE UPDATE ON municipal_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_municipal_bills_updated_at ON municipal_bills;
CREATE TRIGGER update_municipal_bills_updated_at
  BEFORE UPDATE ON municipal_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- #############################################################
-- VIEWS
-- #############################################################

-- Convenience view: contractors with identity joined from contacts
CREATE OR REPLACE VIEW contractor_view AS
SELECT
  co.id,
  co.org_id,
  co.contact_id,
  -- Identity from contacts
  c.entity_type,
  c.first_name,
  c.last_name,
  c.company_name,
  c.trading_as,
  c.registration_number,
  c.vat_number,
  c.contact_first_name,
  c.contact_last_name,
  c.primary_email       AS email,
  c.primary_phone       AS phone,
  c.notes,
  -- Contractor-specific
  co.specialities,
  co.property_ids,
  co.call_out_rate_cents,
  co.hourly_rate_cents,
  co.portal_access_enabled,
  co.auth_user_id,
  co.is_active,
  co.supplier_type,
  co.created_at,
  co.updated_at
FROM contractors co
JOIN contacts c ON c.id = co.contact_id;


-- =============================================================
-- BUILD_60: PROPERTY INFO REQUESTS
-- =============================================================
-- Missing-info follow-up system. Tracks outstanding asks with
-- status, magic-link tokens, reminder cadence, and audit log.

CREATE TABLE IF NOT EXISTS property_info_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organisations(id),
  property_id            uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  topic                  text NOT NULL CHECK (topic IN (
                           'landlord', 'insurance', 'broker', 'scheme',
                           'banking', 'documents', 'compliance', 'other'
                         )),
  missing_fields         text[] NOT NULL,
  recipient_type         text NOT NULL CHECK (recipient_type IN ('owner','broker','self')),
  recipient_contact_id   uuid REFERENCES contacts(id),
  recipient_email        text,
  recipient_phone        text,
  requested_by           uuid NOT NULL REFERENCES auth.users(id),
  token                  text UNIQUE NOT NULL,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN (
                           'pending','sent','viewed','completed','expired','dismissed','failed'
                         )),
  scenario_context       jsonb DEFAULT '{}'::jsonb,
  sent_at                timestamptz,
  viewed_at              timestamptz,
  completed_at           timestamptz,
  expires_at             timestamptz NOT NULL,
  reminder_count         integer NOT NULL DEFAULT 0,
  last_reminder_at       timestamptz,
  completion_log_id      uuid REFERENCES audit_log(id),
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_info_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_property_info_requests" ON property_info_requests;
CREATE POLICY "org_property_info_requests" ON property_info_requests
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_info_requests_property ON property_info_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_info_requests_token    ON property_info_requests(token);
CREATE INDEX IF NOT EXISTS idx_info_requests_status   ON property_info_requests(status, expires_at);

DROP TRIGGER IF EXISTS update_property_info_requests_updated_at ON property_info_requests;
CREATE TRIGGER update_property_info_requests_updated_at
  BEFORE UPDATE ON property_info_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- BUILD_60: PROPERTY INFO REQUEST EVENTS
-- =============================================================

CREATE TABLE IF NOT EXISTS property_info_request_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           uuid NOT NULL REFERENCES property_info_requests(id) ON DELETE CASCADE,
  event_type           text NOT NULL CHECK (event_type IN (
                         'created','email_sent','email_reminder_sent',
                         'viewed','partial_response','completed',
                         'expired','dismissed','resent_manually'
                       )),
  channel              text CHECK (channel IN ('email','whatsapp','sms','in_app')),
  communication_log_id uuid REFERENCES communication_log(id),
  actor_user_id        uuid REFERENCES auth.users(id),
  payload              jsonb DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_info_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_info_request_events" ON property_info_request_events;
CREATE POLICY "org_info_request_events" ON property_info_request_events
  FOR ALL USING (
    request_id IN (
      SELECT id FROM property_info_requests
      WHERE org_id IN (SELECT org_id FROM user_orgs
                       WHERE user_id = auth.uid() AND deleted_at IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_info_request_events_request ON property_info_request_events(request_id);
