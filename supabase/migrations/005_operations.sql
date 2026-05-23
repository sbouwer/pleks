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

-- Prevent duplicate pending requests for the same topic on the same property.
-- DEFERRABLE so the save action can resolve/close the old row before inserting a new one.
ALTER TABLE property_info_requests
  DROP CONSTRAINT IF EXISTS property_info_requests_topic_status_unique;
ALTER TABLE property_info_requests
  ADD CONSTRAINT property_info_requests_topic_status_unique
  UNIQUE (property_id, topic, status) DEFERRABLE INITIALLY DEFERRED;

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- §ADDENDUM_45A  Maintenance lifecycle hardening — cancellation, reassignment, photo visibility
-- ═══════════════════════════════════════════════════════════════════════════════

-- Structured cancellation fields on maintenance_requests
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS cancellation_reason     text;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS cancelled_at            timestamptz;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS cancelled_by            uuid REFERENCES auth.users(id);

-- Cancellation category enum (drop constraint first for idempotency)
ALTER TABLE maintenance_requests DROP CONSTRAINT IF EXISTS maintenance_requests_cancellation_category_check;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS cancellation_category text;
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_cancellation_category_check
  CHECK (cancellation_category IS NULL OR cancellation_category IN (
    'tenant_withdrew',
    'duplicate_request',
    'no_longer_required',
    'contractor_unavailable',
    'agent_decision',
    'work_completed_externally',
    'wrong_property',
    'other'
  ));

-- WO token revocation marker (preserves history; revoked = contractor loses portal access)
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS work_order_token_revoked_at timestamptz;

-- Per-photo tenant-portal visibility toggle
ALTER TABLE maintenance_photos ADD COLUMN IF NOT EXISTS visible_to_tenant boolean NOT NULL DEFAULT true;

-- Denormalized uploader fields on maintenance_photos (set at upload time)
ALTER TABLE maintenance_photos ADD COLUMN IF NOT EXISTS uploaded_by   text;
ALTER TABLE maintenance_photos ADD COLUMN IF NOT EXISTS uploader_name text;

-- Denormalized actor display name on audit_log (set by the mutation that writes the log)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_name text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §BUILD_67  Rules engine: PAIA 90-day PII purge marker on applications
-- ═══════════════════════════════════════════════════════════════════════════════
-- Set by the rejected-applicant-purge rule when PII is removed.
-- Prevents the rule from re-processing the same application on subsequent runs.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS pii_purged_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_applications_pii_purged ON applications(pii_purged_at) WHERE pii_purged_at IS NULL;

-- Denormalized actor display name on contractor_updates (set by the contractor portal)
ALTER TABLE contractor_updates ADD COLUMN IF NOT EXISTS actor_name text;

-- Denormalized contractor name on maintenance_quotes (set when quote is created)
ALTER TABLE maintenance_quotes ADD COLUMN IF NOT EXISTS contractor_name text;

-- in_progress_at timestamp on maintenance_requests (set when status → in_progress)
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS in_progress_at timestamptz;

-- closed_at timestamp on maintenance_requests (set when status → closed)
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §CLEANUP_2026-05-11  Soft-delete for contractors (POPIA s14 purge support)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Enables soft-delete for contractor records so POPIA s14 purge can be
-- implemented without FK cascades. DELETE handler now sets deleted_at instead
-- of hard-deleting. contractor_view excludes soft-deleted rows.
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contractors_active ON contractors(org_id)
  WHERE deleted_at IS NULL;

-- Recreate contractor_view to exclude soft-deleted rows
CREATE OR REPLACE VIEW contractor_view AS
SELECT
  co.id,
  co.org_id,
  co.contact_id,
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
JOIN contacts c ON c.id = co.contact_id
WHERE co.deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §ADDENDUM_60B  Warranty tracking
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracks active warranties on managed properties so agents are alerted when an
-- incoming maintenance request may already be covered. Matches run via Haiku 4.5
-- at the moment a new request is logged. Soft-archive only — no DELETE path.

CREATE TABLE IF NOT EXISTS warranties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- What the warranty covers
  subject         text NOT NULL,
  warranty_type   text NOT NULL CHECK (warranty_type IN (
    'manufacturer',
    'workmanship',
    'building_defects',
    'roof',
    'waterproofing',
    'other'
  )),

  -- Where it applies (property_id always required)
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id         uuid REFERENCES units(id) ON DELETE CASCADE,
  building_id     uuid REFERENCES buildings(id) ON DELETE CASCADE,

  -- Where it came from
  source_type     text NOT NULL CHECK (source_type IN (
    'manual',
    'maintenance_signoff',
    'owner_questionnaire',
    'nhbrc_auto',
    'document_upload'
  )),
  source_maintenance_request_id   uuid REFERENCES maintenance_requests(id),
  source_property_info_request_id uuid REFERENCES property_info_requests(id),
  source_document_id              uuid REFERENCES property_documents(id),

  -- Who handles the claim
  contractor_id     uuid REFERENCES contacts(id),
  manufacturer_name text,

  -- Validity
  starts_on  date NOT NULL,
  expires_on date,

  -- Claim details
  claim_phone       text,
  claim_email       text,
  claim_url         text,
  claim_notes       text,
  terms_document_id uuid REFERENCES property_documents(id),

  -- Internal
  notes       text,
  archived_at timestamptz,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranties_property
  ON warranties (property_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_unit
  ON warranties (unit_id) WHERE unit_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_org_expiry
  ON warranties (org_id, expires_on) WHERE archived_at IS NULL;

ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warranties_select" ON warranties;
CREATE POLICY "warranties_select" ON warranties FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "warranties_insert" ON warranties;
CREATE POLICY "warranties_insert" ON warranties FOR INSERT
  WITH CHECK (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "warranties_update" ON warranties;
CREATE POLICY "warranties_update" ON warranties FOR UPDATE
  USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

-- No DELETE policy — soft-archive only (archived_at). D-60B-14.

DROP TRIGGER IF EXISTS warranties_set_updated_at ON warranties;
CREATE TRIGGER warranties_set_updated_at
  BEFORE UPDATE ON warranties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- maintenance_requests extensions for ADDENDUM_60B
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS workmanship_guarantee_months int,
  ADD COLUMN IF NOT EXISTS workmanship_guarantee_terms  text,
  ADD COLUMN IF NOT EXISTS warranty_claim_id            uuid REFERENCES warranties(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §BUILD_14_v2  Searchworx + FitScore unified screening flow
-- ═══════════════════════════════════════════════════════════════════════════════
-- Unifies applicant ↔ tenant via contacts, adds entity_type for juristic
-- applicants, introduces two-bundle screening (standard/estate), per-line
-- payment tracking for commercial multi-party portal, bank statement
-- classification table, prescreen iterations, immutable screening artifacts.

-- ── applications: contact link + entity type ─────────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS entity_type text
  DEFAULT 'individual' CHECK (entity_type IN ('individual', 'organisation'));

CREATE INDEX IF NOT EXISTS idx_applications_contact_id ON applications(contact_id);
CREATE INDEX IF NOT EXISTS idx_applications_entity_type  ON applications(entity_type);

COMMENT ON COLUMN applications.contact_id IS
  'Link to canonical contacts entity. Set at Step 1 submit via dedup-on-submit.
   Identity fields on this table remain as snapshot/cache for Tribunal evidence.';
COMMENT ON COLUMN applications.entity_type IS
  'Mirrors contacts.entity_type. individual = consumer flow. organisation = commercial.';

-- ── applications: current housing context ────────────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_housing_status text
  CHECK (current_housing_status IN (
    'renting', 'home_owner', 'living_with_family',
    'on_company_housing', 'transitional', 'other'
  ));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_rent_cents         integer;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_landlord_name      text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_lease_end_date     date;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_rent_paid_via      text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_lease_doc_path     text;

-- ── applications: capital coverage path ──────────────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS total_declared_capital_cents bigint;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS capital_coverage_months      integer;

-- ── applications: identity match from bank statement ─────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS bank_statement_holder_match text
  CHECK (bank_statement_holder_match IN (
    'exact', 'variant', 'mismatch', 'unable_to_extract', 'not_checked'
  ));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS bank_statement_holder_confidence      numeric(3,2);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS bank_statement_holder_name_extracted  text;

-- ── applications: Estate bundle criminal check support ───────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS criminal_check_consent_given_at         timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS criminal_check_consent_ip               inet;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS criminal_check_consent_log_id           uuid;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS criminal_check_consent_withdrawn_at     timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS criminal_check_consent_withdrawal_reason text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS huru_check_id        text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS huru_check_status    text
  CHECK (huru_check_status IN ('not_run', 'pending', 'complete', 'failed', 'deleted_post_withdrawal'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS huru_check_completed_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS huru_check_purged_at    timestamptz;

-- ── applications: Pleks-internal tenant signal ───────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS prior_pleks_tenant_signal jsonb;
COMMENT ON COLUMN applications.prior_pleks_tenant_signal IS
  'Cached lookup result. Populated by prescreen when applicant contact_id
   resolves to prior Pleks-managed lease(s). Structure:
   { is_prior_pleks_tenant: bool, payment_quality: text, on_time_count: int,
     late_count: int, missed_count: int, last_lease_end_date: date,
     source_lease_ids: uuid[], narrative: text }';

-- ── listings: bundle selection ────────────────────────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS screening_bundle text
  NOT NULL DEFAULT 'standard'
  CHECK (screening_bundle IN ('standard', 'estate'));

ALTER TABLE listings ALTER COLUMN application_fee_cents SET DEFAULT 25000;

COMMENT ON COLUMN listings.screening_bundle IS
  '"standard" = R250 fee, TU PP + Trace + VCCB Income + Default Listing (TPN).
   "estate"   = R650 fee, adds Huru Criminal Standard. Requires POPIA s26
   additional consent. See SEARCHWORX_RATE_CARD.md.';

-- ── application_co_applicants: contact link + surety flag ────────────────────
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS contact_id         uuid REFERENCES contacts(id);
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS is_surety_director boolean NOT NULL DEFAULT false;
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS individual_fee_cents integer;
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS declined_at         timestamptz;
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS decline_reason      text;

CREATE INDEX IF NOT EXISTS idx_co_applicants_contact_id ON application_co_applicants(contact_id);
CREATE INDEX IF NOT EXISTS idx_co_applicants_surety     ON application_co_applicants(primary_application_id)
  WHERE is_surety_director = true;

COMMENT ON COLUMN application_co_applicants.is_surety_director IS
  'TRUE = director of juristic applicant signing personal surety (commercial).
   FALSE = joint residential co-applicant (spouse, partner).
   Distinguishes the two flows that share the same table.';

-- ── application_directors: full declared director list ───────────────────────
CREATE TABLE IF NOT EXISTS application_directors (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  application_id        uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  id_number             text,
  id_number_hash        text,
  email                 text,
  phone                 text,
  is_signing_surety     boolean NOT NULL DEFAULT false,
  co_applicant_id       uuid REFERENCES application_co_applicants(id),
  cipc_verified         boolean,
  cipc_verified_at      timestamptz,
  cipc_match_confidence numeric(3,2),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_directors_application ON application_directors(application_id);
CREATE INDEX IF NOT EXISTS idx_app_directors_surety      ON application_directors(application_id)
  WHERE is_signing_surety = true;

ALTER TABLE application_directors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_app_directors" ON application_directors;
CREATE POLICY "org_app_directors" ON application_directors
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- ── application_screening_payments: per-line payment tracking ────────────────
CREATE TABLE IF NOT EXISTS application_screening_payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organisations(id),
  application_id         uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  subject_type           text NOT NULL CHECK (subject_type IN ('company', 'co_applicant', 'guarantor')),
  subject_id             uuid NOT NULL,
  fee_cents              integer NOT NULL,
  paid_at                timestamptz,
  paid_by_email          text,
  paid_by_user_id        uuid REFERENCES auth.users(id),
  payfast_transaction_id text,
  refund_amount_cents    integer,
  refunded_at            timestamptz,
  refund_payfast_id      text,
  expires_at             timestamptz NOT NULL DEFAULT now() + interval '14 days',
  expired_state          text CHECK (expired_state IN (
                           'paid_but_no_consent', 'consented_but_no_payment', 'neither', NULL
                         )),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_screening_payments_app    ON application_screening_payments(application_id);
CREATE INDEX IF NOT EXISTS idx_screening_payments_expiry ON application_screening_payments(expires_at)
  WHERE paid_at IS NULL OR expired_state IS NULL;

ALTER TABLE application_screening_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_screening_payments" ON application_screening_payments;
CREATE POLICY "org_screening_payments" ON application_screening_payments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP TRIGGER IF EXISTS update_screening_payments_updated_at ON application_screening_payments;
CREATE TRIGGER update_screening_payments_updated_at
  BEFORE UPDATE ON application_screening_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── application_bank_statement_classifications ────────────────────────────────
CREATE TABLE IF NOT EXISTS application_bank_statement_classifications (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organisations(id),
  application_id              uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  co_applicant_id             uuid REFERENCES application_co_applicants(id) ON DELETE CASCADE,
  bank_statement_doc_path     text NOT NULL,
  payee_signature             text NOT NULL,
  payee_description_example   text NOT NULL,
  monthly_mean_cents          bigint NOT NULL,
  monthly_min_cents           bigint NOT NULL,
  monthly_max_cents           bigint NOT NULL,
  monthly_variance_cents      bigint NOT NULL DEFAULT 0,
  occurrence_count            integer NOT NULL,
  sonnet_classification       text NOT NULL,
  sonnet_confidence           numeric(3,2) NOT NULL,
  applicant_classification    text,
  applicant_classified_at     timestamptz,
  final_classification        text NOT NULL,
  is_counted_in_commitments   boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsc_application  ON application_bank_statement_classifications(application_id);
CREATE INDEX IF NOT EXISTS idx_bsc_co_applicant ON application_bank_statement_classifications(co_applicant_id);

ALTER TABLE application_bank_statement_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_bank_classifications" ON application_bank_statement_classifications;
CREATE POLICY "org_bank_classifications" ON application_bank_statement_classifications
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP TRIGGER IF EXISTS update_bank_classifications_updated_at ON application_bank_statement_classifications;
CREATE TRIGGER update_bank_classifications_updated_at
  BEFORE UPDATE ON application_bank_statement_classifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Named CHECK constraints (Postgres auto-names inline CHECK with truncated table name;
-- we name them explicitly so drift checks stay clean on replay)
ALTER TABLE application_bank_statement_classifications
  DROP CONSTRAINT IF EXISTS bsc_sonnet_confidence_check,
  DROP CONSTRAINT IF EXISTS bsc_final_classification_check,
  DROP CONSTRAINT IF EXISTS application_bank_statement_classific_final_classification_check,
  DROP CONSTRAINT IF EXISTS application_bank_statement_classificati_sonnet_confidence_check;

ALTER TABLE application_bank_statement_classifications
  ADD CONSTRAINT bsc_sonnet_confidence_check
    CHECK (sonnet_confidence >= 0 AND sonnet_confidence <= 1);

ALTER TABLE application_bank_statement_classifications
  ADD CONSTRAINT bsc_final_classification_check
    CHECK (final_classification IN (
      'rent_or_housing', 'debt_repayment', 'subscription', 'utility',
      'insurance', 'medical_aid', 'school_fees', 'transfer_to_business',
      'family_support_or_personal', 'once_off_treated_as_such',
      'dont_recognise_flag_for_agent', 'other', 'unclassified_skipped'
    ));

-- ── application_prescreens: iterative prescreen history ──────────────────────
CREATE TABLE IF NOT EXISTS application_prescreens (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                        uuid NOT NULL REFERENCES organisations(id),
  application_id                uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  iteration_number              integer NOT NULL DEFAULT 1,
  affordability_score           integer NOT NULL CHECK (affordability_score >= 0 AND affordability_score <= 25),
  affordability_source          text NOT NULL CHECK (affordability_source IN ('income', 'capital', 'hybrid')),
  income_to_rent_ratio          numeric(5,2),
  capital_coverage_months       integer,
  commitments_score             integer NOT NULL CHECK (commitments_score >= 0 AND commitments_score <= 15),
  classified_commitments_cents  bigint NOT NULL DEFAULT 0,
  current_rent_matched          boolean,
  unclassified_debits_count     integer NOT NULL DEFAULT 0,
  identity_match                text CHECK (identity_match IN (
    'exact', 'variant', 'mismatch', 'unable_to_extract', 'not_checked'
  )),
  identity_requires_review      boolean NOT NULL DEFAULT false,
  documents_score               integer NOT NULL CHECK (documents_score >= 0 AND documents_score <= 5),
  missing_required_docs         text[],
  is_prior_pleks_tenant         boolean NOT NULL DEFAULT false,
  pleks_payment_quality         text,
  total_score                   integer NOT NULL CHECK (total_score >= 0 AND total_score <= 55),
  flag                          text NOT NULL CHECK (flag IN ('green', 'yellow', 'red')),
  applicant_narrative           text NOT NULL,
  agent_narrative               text NOT NULL,
  input_snapshot                jsonb NOT NULL,
  generated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, iteration_number)
);

CREATE INDEX IF NOT EXISTS idx_prescreens_application ON application_prescreens(application_id);
CREATE INDEX IF NOT EXISTS idx_prescreens_latest      ON application_prescreens(application_id, iteration_number DESC);

ALTER TABLE application_prescreens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_prescreens" ON application_prescreens;
CREATE POLICY "org_prescreens" ON application_prescreens
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- ── screening_artifacts: immutable PDF records ───────────────────────────────
CREATE TABLE IF NOT EXISTS screening_artifacts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organisations(id),
  application_id              uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  artifact_type               text NOT NULL CHECK (artifact_type IN (
    'commercial_consumer_report', 'director_consumer_report',
    'individual_consumer_report', 'agent_report'
  )),
  recipient_type              text NOT NULL CHECK (recipient_type IN (
    'company_rep', 'director', 'applicant', 'agency'
  )),
  recipient_co_applicant_id   uuid REFERENCES application_co_applicants(id),
  recipient_email             text,
  storage_path                text NOT NULL,
  signed_url_expires_at       timestamptz,
  manifest_hash               text,
  generated_at                timestamptz NOT NULL DEFAULT now(),
  generated_by                uuid REFERENCES auth.users(id),
  emailed_at                  timestamptz,
  viewed_by_recipient_at      timestamptz,
  download_count              integer NOT NULL DEFAULT 0,
  supersedes_artifact_id      uuid REFERENCES screening_artifacts(id),
  regeneration_reason         text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screening_artifacts_app            ON screening_artifacts(application_id);
CREATE INDEX IF NOT EXISTS idx_screening_artifacts_recipient_email ON screening_artifacts(recipient_email)
  WHERE recipient_email IS NOT NULL;

ALTER TABLE screening_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_screening_artifacts" ON screening_artifacts;
CREATE POLICY "org_screening_artifacts" ON screening_artifacts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "screening_artifacts_no_update" ON screening_artifacts;
CREATE POLICY "screening_artifacts_no_update" ON screening_artifacts
  FOR UPDATE USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "screening_artifacts_no_delete" ON screening_artifacts;
CREATE POLICY "screening_artifacts_no_delete" ON screening_artifacts
  FOR DELETE USING (false);

-- ── v_application_screening_lines: orchestration view ────────────────────────
CREATE OR REPLACE VIEW v_application_screening_lines AS
SELECT
  app.id AS application_id,
  app.org_id,
  'company'::text AS subject_type,
  app.id AS subject_id,
  COALESCE(ctc.company_name, ctc.trading_as, app.first_name || ' ' || app.last_name) AS subject_name,
  asp.fee_cents,
  asp.paid_at,
  app.stage2_consent_given_at AS consented_at,
  asp.expires_at,
  CASE
    WHEN asp.paid_at IS NOT NULL AND app.stage2_consent_given_at IS NOT NULL
         AND app.searchworx_check_status = 'complete'                            THEN 'complete'
    WHEN asp.paid_at IS NOT NULL AND app.stage2_consent_given_at IS NOT NULL
         AND app.searchworx_check_status IN ('pending', 'not_run')               THEN 'ready_to_run'
    WHEN asp.paid_at IS NOT NULL AND app.stage2_consent_given_at IS NULL         THEN 'paid_pending_consent'
    WHEN asp.paid_at IS NULL    AND app.stage2_consent_given_at IS NOT NULL      THEN 'consented_pending_payment'
    WHEN asp.expires_at < now()                                                  THEN 'expired_no_consent'
    ELSE 'pending_both'
  END AS state
FROM applications app
LEFT JOIN contacts ctc ON ctc.id = app.contact_id
LEFT JOIN application_screening_payments asp
  ON asp.application_id = app.id
  AND asp.subject_type = 'company'
  AND asp.subject_id   = app.id
WHERE app.entity_type = 'organisation'

UNION ALL

SELECT
  caa.primary_application_id AS application_id,
  caa.org_id,
  'co_applicant'::text AS subject_type,
  caa.id AS subject_id,
  COALESCE(c.first_name || ' ' || c.last_name, caa.first_name || ' ' || caa.last_name) AS subject_name,
  asp.fee_cents,
  asp.paid_at,
  caa.stage2_consent_given_at AS consented_at,
  asp.expires_at,
  CASE
    WHEN asp.paid_at IS NOT NULL AND caa.stage2_consent_given_at IS NOT NULL
         AND caa.searchworx_check_status = 'complete'                            THEN 'complete'
    WHEN asp.paid_at IS NOT NULL AND caa.stage2_consent_given_at IS NOT NULL
         AND caa.searchworx_check_status IN ('pending', 'not_run')               THEN 'ready_to_run'
    WHEN asp.paid_at IS NOT NULL AND caa.stage2_consent_given_at IS NULL         THEN 'paid_pending_consent'
    WHEN asp.paid_at IS NULL    AND caa.stage2_consent_given_at IS NOT NULL      THEN 'consented_pending_payment'
    WHEN asp.expires_at < now()                                                  THEN 'expired_no_consent'
    ELSE 'pending_both'
  END AS state
FROM application_co_applicants caa
LEFT JOIN contacts c ON c.id = caa.contact_id
LEFT JOIN application_screening_payments asp
  ON asp.application_id = caa.primary_application_id
  AND asp.subject_type  = 'co_applicant'
  AND asp.subject_id    = caa.id
WHERE caa.declined_at IS NULL;

COMMENT ON VIEW v_application_screening_lines IS
  'Multi-party screening portal view. Joins applications + co-applicants +
   screening payments to derive per-line state. Drives the portal page UI
   and the screening-line-runner cron.';

-- ── BUILD_14_v2 corrections (CD audit findings) ─────────────────────────────
-- Finding 1: bsc upsert requires a matching UNIQUE constraint. Omitting
-- co_applicant_id from the key would silently collide two co-applicants who
-- share a payee (e.g., both pay DStv). NULLS NOT DISTINCT (Postgres 15+)
-- makes the NULL co_applicant_id row for the primary applicant a single
-- canonical slot — duplicate Sonnet runs for the same primary applicant
-- and payee correctly conflict.
ALTER TABLE application_bank_statement_classifications
  DROP CONSTRAINT IF EXISTS bsc_unique_per_subject;
ALTER TABLE application_bank_statement_classifications
  ADD CONSTRAINT bsc_unique_per_subject
  UNIQUE NULLS NOT DISTINCT (application_id, co_applicant_id, payee_signature);

-- Finding 2: identity_score + pleks_bonus_score component columns missing from
-- application_prescreens — the total_score was persisted but the breakdown
-- wasn't reconstructible for Tribunal-grade audit. income_cents / capital_cents
-- preserve the raw rand inputs that produced Ratio 1 (currently only the
-- derived ratio is stored).
ALTER TABLE application_prescreens ADD COLUMN IF NOT EXISTS identity_score    integer NOT NULL DEFAULT 0;
ALTER TABLE application_prescreens ADD COLUMN IF NOT EXISTS pleks_bonus_score integer NOT NULL DEFAULT 0;
ALTER TABLE application_prescreens ADD COLUMN IF NOT EXISTS income_cents      bigint;
ALTER TABLE application_prescreens ADD COLUMN IF NOT EXISTS capital_cents     bigint;

ALTER TABLE application_prescreens
  DROP CONSTRAINT IF EXISTS prescreens_identity_score_check,
  DROP CONSTRAINT IF EXISTS prescreens_pleks_bonus_score_check;
ALTER TABLE application_prescreens
  ADD CONSTRAINT prescreens_identity_score_check    CHECK (identity_score    >= 0 AND identity_score    <= 5),
  ADD CONSTRAINT prescreens_pleks_bonus_score_check CHECK (pleks_bonus_score >= 0 AND pleks_bonus_score <= 5);

-- ── ADDENDUM_14B closing-pass audit fixes ────────────────────────────────────
-- F4: reminder cron used strict day-equality; a missed cron run permanently
-- skips that milestone. Shift to "any due milestone not yet sent" using a
-- jsonb set on the co-applicant row. Each key (t3/t7/t10) is set to true
-- when that reminder fires, so it never fires twice regardless of cron gaps.
ALTER TABLE application_co_applicants
  ADD COLUMN IF NOT EXISTS reminder_milestones_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════════
-- End §BUILD_14_v2
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- §ADDENDUM_14F  2-step SMS consent verification infrastructure
-- ═══════════════════════════════════════════════════════════════════════════════
-- Per-verification-ceremony event log. One row per SMS/email send event.
-- Codes stored as HMAC-SHA256 with per-row salt — never plaintext.
-- Retention: verified rows retained with parent consent_log; expired/invalidated/
-- abandoned rows purged after 30 days by cron.
-- See ADDENDUM_14F_CONSENT_VERIFICATION.md §Audit Trail Layer 2.

CREATE TABLE IF NOT EXISTS consent_verifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        REFERENCES organisations(id) ON DELETE CASCADE,
  application_id    uuid        REFERENCES applications(id) ON DELETE CASCADE,
  director_token    text,
  consent_log_id    uuid        REFERENCES consent_log(id),
  consent_type      text        NOT NULL
                    CHECK (consent_type IN (
                      'standard_bundle',
                      'estate_criminal',
                      'director_standard',
                      'director_estate_criminal'
                    )),
  verification_method text      NOT NULL
                    CHECK (verification_method IN ('sms_code', 'email_link')),
  target_phone_e164 text,
  target_email      text,
  code_hash         text        NOT NULL,
  code_salt         text        NOT NULL,
  code_sent_at      timestamptz NOT NULL DEFAULT now(),
  code_expires_at   timestamptz NOT NULL,
  code_verified_at  timestamptz,
  attempts          integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending', 'verified', 'expired', 'invalidated', 'abandoned'
                    )),
  client_ip         inet,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_verif_application ON consent_verifications(application_id);
CREATE INDEX IF NOT EXISTS idx_consent_verif_director    ON consent_verifications(director_token)
  WHERE director_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consent_verif_pending     ON consent_verifications(status, code_expires_at)
  WHERE status = 'pending';

ALTER TABLE consent_verifications ENABLE ROW LEVEL SECURITY;
-- Service role only — no anon or agent-direct policy; all access via service client
-- in API routes that validate tokens first.

-- ── Rate-limit tracking per identifier (E.164 phone or canonical email) ──
CREATE TABLE IF NOT EXISTS consent_verification_rate_limits (
  identifier                  text        PRIMARY KEY,
  sends_window_start          timestamptz NOT NULL,
  sends_in_window             integer     NOT NULL DEFAULT 0,
  consecutive_failed_codes    integer     NOT NULL DEFAULT 0,
  soft_lockout_until          timestamptz,
  hard_lockout_until          timestamptz,
  soft_lockout_count_24h      integer     NOT NULL DEFAULT 0,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- F3: 24h decay for soft_lockout_count_24h — tracks when the last soft lockout occurred
ALTER TABLE consent_verification_rate_limits ADD COLUMN IF NOT EXISTS last_soft_lockout_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rate_limit_hard_lockout ON consent_verification_rate_limits(hard_lockout_until)
  WHERE hard_lockout_until IS NOT NULL;

ALTER TABLE consent_verification_rate_limits ENABLE ROW LEVEL SECURITY;
-- Service role only — no client-facing policies.

-- ═══════════════════════════════════════════════════════════════════════════════
-- §ADDENDUM_14A  Property-intelligence module (PAYG)
-- ═══════════════════════════════════════════════════════════════════════════════
-- property_intelligence_pulls: one row per agent-initiated vendor pull (Deeds,
-- Lightstone, CIPC). Immutable after creation — status transitions via service role.
-- vendor_usage: cost-observability sibling to ai_usage (D-14A-18).

CREATE TABLE IF NOT EXISTS property_intelligence_pulls (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- What was pulled
  product_type        text        NOT NULL
                      CHECK (product_type IN (
                        'deeds_search',
                        'lightstone_erf_short',
                        'cipc_company',
                        'cipc_director'
                      )),

  -- Target identification
  property_id         uuid        REFERENCES properties(id),
  landlord_id         uuid        REFERENCES contacts(id),
  subject_identifier  text        NOT NULL,
  subject_label       text,

  -- Vendor response
  searchworx_response_jsonb jsonb,
  extracted_facts_jsonb     jsonb,
  pdf_storage_path          text,

  -- Status
  status              text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending',
                        'running',
                        'complete',
                        'failed',
                        'no_data_found'
                      )),
  failure_reason      text,

  -- Billing
  retail_cents        integer     NOT NULL,
  cost_cents          integer     NOT NULL,
  payfast_payment_id  uuid        REFERENCES payments(id),
  refunded_payment_id uuid        REFERENCES payments(id),

  -- Audit
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  uuid        NOT NULL REFERENCES auth.users(id),
  completed_at        timestamptz,
  failed_at           timestamptz,
  refunded_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pip_org_property ON property_intelligence_pulls(org_id, property_id)
  WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pip_org_landlord ON property_intelligence_pulls(org_id, landlord_id)
  WHERE landlord_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pip_org_recent   ON property_intelligence_pulls(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pip_org_status   ON property_intelligence_pulls(org_id, status)
  WHERE status IN ('pending', 'running');

ALTER TABLE property_intelligence_pulls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pip_org_read"   ON property_intelligence_pulls;
DROP POLICY IF EXISTS "pip_org_insert" ON property_intelligence_pulls;

CREATE POLICY "pip_org_read" ON property_intelligence_pulls
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

CREATE POLICY "pip_org_insert" ON property_intelligence_pulls
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
    AND created_by_user_id = auth.uid()
  );

-- vendor_usage: service-role-only cost ledger (D-14A-18)
CREATE TABLE IF NOT EXISTS vendor_usage (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vendor       text        NOT NULL CHECK (vendor IN ('searchworx', 'payfast')),
  product_key  text        NOT NULL,
  cost_cents   integer     NOT NULL,
  retail_cents integer,
  ref_table    text,
  ref_id       uuid,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_usage_org_date   ON vendor_usage(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_usage_org_vendor ON vendor_usage(org_id, vendor);
CREATE INDEX IF NOT EXISTS idx_vendor_usage_ref        ON vendor_usage(ref_table, ref_id)
  WHERE ref_id IS NOT NULL;

ALTER TABLE vendor_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_usage_org_read" ON vendor_usage;

CREATE POLICY "vendor_usage_org_read" ON vendor_usage
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));
-- No INSERT policy — service role writes only.

-- ═══════════════════════════════════════════════════════════════════════════════
-- §28  ADDENDUM_14H: screening-reports Storage bucket + search_token column
-- ═══════════════════════════════════════════════════════════════════════════════
-- Searchworx generates a PDF on every product call. We download it immediately
-- and store here; the vendor URL is publicly accessible by GUID and must never
-- be exposed to client code or logged outside lib/searchworx/.
-- Path convention: {org_id}/{ref_id}/{search_token}-{artefact_kind}.{ext}
-- ref_id = property_intelligence_pulls.id or application_screening_payments.id

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'screening-reports', 'screening-reports', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'screening_reports_org_read'
  ) THEN
    CREATE POLICY "screening_reports_org_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'screening-reports'
        AND (storage.foldername(name))[1] IN (
          SELECT org_id::text FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- Add search_token to property_intelligence_pulls (populated once per-product modules return real tokens)
ALTER TABLE property_intelligence_pulls
  ADD COLUMN IF NOT EXISTS search_token uuid;

-- §28.1 patch: searchworx_pdf_storage_path (run route writes to it — was absent from original §28)
-- Points to the raw Searchworx vendor PDF stored in screening-reports bucket.
-- Distinct from pdf_storage_path (Pleks-branded report in property-intelligence bucket).
ALTER TABLE property_intelligence_pulls
  ADD COLUMN IF NOT EXISTS searchworx_pdf_storage_path text;

-- §28.2  Deferred — see §28.5 below. The spec assumed this was an existing table; it is a Phase 2 CREATE.

-- §28.3  BUILD_14_AMENDMENT_14H_V2: FitScore document on application, current run pointer
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS fitscore_document_path    text,
  ADD COLUMN IF NOT EXISTS fitscore_generated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS current_screening_run_id  uuid;

CREATE INDEX IF NOT EXISTS applications_current_screening_run_id_idx
  ON public.applications (current_screening_run_id)
  WHERE current_screening_run_id IS NOT NULL;

COMMENT ON COLUMN public.applications.fitscore_document_path IS
  'Storage path in screening-reports bucket for the consolidated FitScore document (Stream 2 artefact — agent-only).';
COMMENT ON COLUMN public.applications.fitscore_generated_at IS
  'Timestamp when current fitscore_document was generated. NULL until first generation.';
COMMENT ON COLUMN public.applications.current_screening_run_id IS
  'Points to the screening_run_id of the most recent screening run for this application.';

-- §28.4  BUILD_14_AMENDMENT_14H_V2: applicant read access to bureau PDFs, NOT FitScore document
-- Path: {orgId}/{applicationId}/{productKey}/{token}-{kind}.{ext} — foldername[2] = applicationId.
-- applicant = tenant without a lease; link is applications.tenant_id → tenants.auth_user_id.
DROP POLICY IF EXISTS "Applicants can read their own bureau PDFs (not FitScore)" ON storage.objects;
CREATE POLICY "Applicants can read their own bureau PDFs (not FitScore)"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'screening-reports'
    AND (storage.foldername(name))[2] IN (
      SELECT a.id::text
      FROM public.applications a
      JOIN public.tenants t ON t.id = a.tenant_id
      WHERE t.auth_user_id = auth.uid()
    )
    AND name NOT LIKE '%/fitscore-%'
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §28.5  BUILD_14H_PHASE2: application_screening_lines — per-subject per-product results
-- ═══════════════════════════════════════════════════════════════════════════════
-- One row per screening subject × bundle product × screening run.
-- Subjects come from v_application_screening_lines (primary applicant + co-applicants).
-- The §28.2 columns (pdf_storage_path, result_summary, screening_run_id) are included here
-- since the table is new. The ALTER TABLE stubs in §28.2 are no-ops (IF NOT EXISTS guard).
CREATE TABLE IF NOT EXISTS public.application_screening_lines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  application_id          uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  subject_type            text NOT NULL CHECK (subject_type IN ('company', 'co_applicant', 'guarantor')),
  subject_id              uuid NOT NULL,
  product_key             text NOT NULL,
  screening_run_id        uuid,
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'refunded')),
  cost_cents              integer,
  retail_cost_cents       integer,
  pdf_storage_path        text,
  result_summary          text,
  searchworx_search_token text,
  started_at              timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screening_lines_application
  ON public.application_screening_lines (application_id);
CREATE INDEX IF NOT EXISTS idx_screening_lines_run
  ON public.application_screening_lines (screening_run_id)
  WHERE screening_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_screening_lines_subject
  ON public.application_screening_lines (subject_type, subject_id);

COMMENT ON TABLE public.application_screening_lines IS
  'One row per screening subject × bundle product × run. Drives bundle-runner writes and agent dashboard reads.';
COMMENT ON COLUMN public.application_screening_lines.subject_type IS
  'Mirrors application_screening_payments.subject_type: company (primary applicant entity), co_applicant, guarantor.';
COMMENT ON COLUMN public.application_screening_lines.product_key IS
  'Bundle product identifier: combined_consumer_credit_report | vccb_income_estimator. Matches costs.ts keys.';
COMMENT ON COLUMN public.application_screening_lines.screening_run_id IS
  'Groups all lines in the same bundle run. Re-screening produces a new run_id; prior runs are preserved.';
COMMENT ON COLUMN public.application_screening_lines.pdf_storage_path IS
  'Path in screening-reports bucket for the raw vendor PDF (Stream 1 artefact). applicants see via §28.4 RLS.';
COMMENT ON COLUMN public.application_screening_lines.result_summary IS
  'Agent-facing one-liner from COMBINED_RESULT_SUMMARIES or VCCB_RESULT_SUMMARIES constants.';

ALTER TABLE public.application_screening_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_screening_lines" ON public.application_screening_lines;
CREATE POLICY "org_screening_lines" ON public.application_screening_lines
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP TRIGGER IF EXISTS update_screening_lines_updated_at ON public.application_screening_lines;
CREATE TRIGGER update_screening_lines_updated_at
  BEFORE UPDATE ON public.application_screening_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- §29  BUILD_FITSCORE_v1: FitScore Composite Engine
--
-- Implements ADDENDUM_14H_FITSCORE_COMPOSITE.md §§5.3-5.8
-- Lease-level composite scoring with explainability persistence.
-- Multi-applicant via existing primary-on-applications +
-- application_co_applicants pattern (Decision #9 / §5.5).
-- Hard-flag taxonomy persistence (§3.8). Audit-replayable.
--
-- Spec: brief/build/_ADDENDUM/ADDENDUM_14H_FITSCORE_COMPOSITE.md
-- Date: 2026-05-21
--
-- Pre-flight verification (CC, 2026-05-21):
--   applications.fitscore:            present (integer CHECK 0-100)
--   applications.fitscore_components: present (jsonb)
--   applications.fitscore_summary:    present (text, legacy — preserved unchanged)
--   applications.fitscore_document_path: present (added §28.3)
--   application_co_applicants:        present, extensive schema, ON DELETE CASCADE
--   application_screening_lines:      present (§28.5), polymorphic, primary applicant
--                                     bureau data NOT in screening_lines (on applications directly)
--   audit_log column shape:           table_name / record_id / changed_by / old_values /
--                                     new_values / ip_address / user_agent / actor_name
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── §5.3 FitScore composite + explainability columns on applications ──────────

-- Composite output columns
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_band                    text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_confidence_index         text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_verification_integrity   text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_material_flags           jsonb DEFAULT '[]'::jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_computed_at              timestamptz;

-- Structured AI narrative output (separate from legacy fitscore_summary text —
-- preserves BUILD_14 historical semantics, avoids overloaded meaning, supports
-- cleaner replay. NarrativeResponse JSONB shape per DELIVERY §7.8.)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_narrative                jsonb;

-- Explainability persistence (POPIA s23 replay)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_engine_version           text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_inputs_hash              text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_component_snapshot       jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_narrative_prompt_version text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_runtime_code_hash        text;

-- Interpretation document version at score time — closes methodology provenance chain.
-- Surfaced in Stream 2 PDF footer and L2 POPIA s23 response (DELIVERY §6.11 / §8.6).
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fitscore_interpretation_version   text;

-- CHECK constraints — enforce enumerated values
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_fitscore_band_check;
ALTER TABLE applications ADD  CONSTRAINT applications_fitscore_band_check CHECK (
  fitscore_band IS NULL OR fitscore_band IN (
    'verified_stability', 'stable_profile', 'cautious_review',
    'limited_confidence', 'adverse_signals', 'limited_data_profile', 'blocked'
  )
);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_fitscore_confidence_index_check;
ALTER TABLE applications ADD  CONSTRAINT applications_fitscore_confidence_index_check CHECK (
  fitscore_confidence_index IS NULL OR fitscore_confidence_index IN (
    'high', 'medium', 'low', 'insufficient'
  )
);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_fitscore_verification_integrity_check;
ALTER TABLE applications ADD  CONSTRAINT applications_fitscore_verification_integrity_check CHECK (
  fitscore_verification_integrity IS NULL OR fitscore_verification_integrity IN (
    'high', 'medium', 'low', 'limited'
  )
);

-- ─── §5.5a Per-applicant verification columns — primary applicant (on applications) ──

ALTER TABLE applications ADD COLUMN IF NOT EXISTS income_evidence_tier integer
  CHECK (income_evidence_tier IS NULL OR income_evidence_tier IN (1, 2, 3, 4));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS verified_monthly_income_cents bigint;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS identity_match_status text
  CHECK (identity_match_status IS NULL OR identity_match_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS identity_match_reference text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS employer_verification_status text
  CHECK (employer_verification_status IS NULL OR employer_verification_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS salary_reconciliation_status text
  CHECK (salary_reconciliation_status IS NULL OR salary_reconciliation_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS document_consistency_status text
  CHECK (document_consistency_status IS NULL OR document_consistency_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS bank_account_ownership_status text
  CHECK (bank_account_ownership_status IS NULL OR bank_account_ownership_status IN ('pass','fail','pending','not_attempted'));

ALTER TABLE applications ADD COLUMN IF NOT EXISTS verification_integrity_grade text
  CHECK (verification_integrity_grade IS NULL OR verification_integrity_grade IN ('high','medium','low','limited'));

-- Pleks-network history (populated when ADDENDUM_14K ships)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS pleks_network_history_status text
  CHECK (pleks_network_history_status IS NULL OR pleks_network_history_status IN ('trusted','adverse','none'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS pleks_network_tenancy_count integer;

-- ─── §5.5b Per-applicant verification columns — co-applicants (on application_co_applicants) ──

ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS income_evidence_tier integer
  CHECK (income_evidence_tier IS NULL OR income_evidence_tier IN (1, 2, 3, 4));
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS verified_monthly_income_cents bigint;

ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS identity_match_status text
  CHECK (identity_match_status IS NULL OR identity_match_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS identity_match_reference text;
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS employer_verification_status text
  CHECK (employer_verification_status IS NULL OR employer_verification_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS salary_reconciliation_status text
  CHECK (salary_reconciliation_status IS NULL OR salary_reconciliation_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS document_consistency_status text
  CHECK (document_consistency_status IS NULL OR document_consistency_status IN ('pass','fail','pending','not_attempted'));
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS bank_account_ownership_status text
  CHECK (bank_account_ownership_status IS NULL OR bank_account_ownership_status IN ('pass','fail','pending','not_attempted'));

ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS verification_integrity_grade text
  CHECK (verification_integrity_grade IS NULL OR verification_integrity_grade IN ('high','medium','low','limited'));

-- Pleks-network history (populated when ADDENDUM_14K ships)
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS pleks_network_history_status text
  CHECK (pleks_network_history_status IS NULL OR pleks_network_history_status IN ('trusted','adverse','none'));
ALTER TABLE application_co_applicants ADD COLUMN IF NOT EXISTS pleks_network_tenancy_count integer;

-- ─── §5.6 Indexes ──────────────────────────────────────────────────────────────

-- Replay: all scores from a given engine version
CREATE INDEX IF NOT EXISTS idx_applications_fitscore_engine_version
  ON applications(fitscore_engine_version)
  WHERE fitscore_engine_version IS NOT NULL;

-- Ops: range scans over scoring history
CREATE INDEX IF NOT EXISTS idx_applications_fitscore_computed_at
  ON applications(fitscore_computed_at)
  WHERE fitscore_computed_at IS NOT NULL;

-- Agent dashboard: filter by band
CREATE INDEX IF NOT EXISTS idx_applications_fitscore_band
  ON applications(org_id, fitscore_band)
  WHERE fitscore_band IS NOT NULL;

-- Ops: surface all blocked applications across an agency
CREATE INDEX IF NOT EXISTS idx_applications_fitscore_blocked
  ON applications(org_id, created_at)
  WHERE fitscore_band = 'blocked';

-- ADDENDUM_14K network history: primary applicant passport lookup
-- applications has a dedicated passport_number column (BUILD_00, line 354) — distinct
-- from application_co_applicants which stores passports in id_number WHERE id_type='passport'
CREATE INDEX IF NOT EXISTS idx_applications_passport_number
  ON applications(passport_number)
  WHERE passport_number IS NOT NULL;

-- ADDENDUM_14K network history: co-applicant SA ID lookup
CREATE INDEX IF NOT EXISTS idx_co_applicants_id_number
  ON application_co_applicants(id_number)
  WHERE id_number IS NOT NULL;

-- ADDENDUM_14K network history: co-applicant passport lookup
-- application_co_applicants has no separate passport_number column; passports live in
-- id_number discriminated by id_type='passport'
CREATE INDEX IF NOT EXISTS idx_co_applicants_passport_lookup
  ON application_co_applicants(id_number)
  WHERE id_type = 'passport';

-- Orchestrator joins: co-applicants by parent application
CREATE INDEX IF NOT EXISTS idx_co_applicants_primary_application_id
  ON application_co_applicants(primary_application_id);

-- ─── §5.8 Audit trigger — fitscore_* column changes on applications ────────────

CREATE OR REPLACE FUNCTION audit_applications_fitscore_changes()
RETURNS trigger AS $func$
DECLARE
  fitscore_old_values jsonb;
  fitscore_new_values jsonb;
BEGIN
  -- Only log when a fitscore_* column actually changed
  IF NEW.fitscore                        IS DISTINCT FROM OLD.fitscore
     OR NEW.fitscore_band                IS DISTINCT FROM OLD.fitscore_band
     OR NEW.fitscore_confidence_index    IS DISTINCT FROM OLD.fitscore_confidence_index
     OR NEW.fitscore_verification_integrity IS DISTINCT FROM OLD.fitscore_verification_integrity
     OR NEW.fitscore_material_flags      IS DISTINCT FROM OLD.fitscore_material_flags
     OR NEW.fitscore_engine_version      IS DISTINCT FROM OLD.fitscore_engine_version
     OR NEW.fitscore_inputs_hash         IS DISTINCT FROM OLD.fitscore_inputs_hash
     OR NEW.fitscore_narrative           IS DISTINCT FROM OLD.fitscore_narrative
     OR NEW.fitscore_interpretation_version IS DISTINCT FROM OLD.fitscore_interpretation_version
  THEN
    fitscore_old_values := jsonb_build_object(
      'fitscore',                          OLD.fitscore,
      'fitscore_band',                     OLD.fitscore_band,
      'fitscore_confidence_index',         OLD.fitscore_confidence_index,
      'fitscore_verification_integrity',   OLD.fitscore_verification_integrity,
      'fitscore_material_flags',           OLD.fitscore_material_flags,
      'fitscore_engine_version',           OLD.fitscore_engine_version,
      'fitscore_inputs_hash',              OLD.fitscore_inputs_hash,
      'fitscore_narrative',                OLD.fitscore_narrative,
      'fitscore_interpretation_version',   OLD.fitscore_interpretation_version
    );

    fitscore_new_values := jsonb_build_object(
      'fitscore',                          NEW.fitscore,
      'fitscore_band',                     NEW.fitscore_band,
      'fitscore_confidence_index',         NEW.fitscore_confidence_index,
      'fitscore_verification_integrity',   NEW.fitscore_verification_integrity,
      'fitscore_material_flags',           NEW.fitscore_material_flags,
      'fitscore_engine_version',           NEW.fitscore_engine_version,
      'fitscore_inputs_hash',              NEW.fitscore_inputs_hash,
      'fitscore_narrative',                NEW.fitscore_narrative,
      'fitscore_interpretation_version',   NEW.fitscore_interpretation_version
    );

    INSERT INTO audit_log (
      org_id, table_name, record_id, action,
      changed_by, actor_name, ip_address, user_agent,
      old_values, new_values, created_at
    ) VALUES (
      NEW.org_id,
      'applications',
      NEW.id,
      'UPDATE',
      COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, NULL),
      NULLIF(current_setting('app.current_user_name', true), ''),
      NULLIF(current_setting('app.current_ip', true), '')::inet,
      NULLIF(current_setting('app.current_user_agent', true), ''),
      fitscore_old_values,
      fitscore_new_values,
      now()
    );
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_applications_fitscore_trigger ON applications;
CREATE TRIGGER audit_applications_fitscore_trigger
  AFTER UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION audit_applications_fitscore_changes();

-- §29.2  Drop duplicate index on application_co_applicants(primary_application_id)
-- idx_co_applicants_primary (BUILD_14 v1) and idx_co_applicants_primary_application_id (§29 §5.6)
-- both cover the same column. Retaining the original; dropping the §29 duplicate.
DROP INDEX IF EXISTS idx_co_applicants_primary_application_id;

-- §29.1  Phase B backfill — label pre-v1 scores (ADDENDUM_14H COMPOSITE §5.4)
-- Runs idempotently: no-op when fitscore IS NULL (no rows to backfill at 2026-05-21 Phase B landing).
UPDATE applications
  SET fitscore_engine_version = 'legacy_v0_unreplayable'
  WHERE fitscore IS NOT NULL
    AND fitscore_engine_version IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §29.3  ADDENDUM_14H E.4: synthesis template version tracking
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS fitscore_synthesis_template_version VARCHAR(32)
    NOT NULL DEFAULT 'synthesis.v1.0';
