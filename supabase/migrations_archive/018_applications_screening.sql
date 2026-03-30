-- 018_applications_screening.sql
-- Listings, applications (two-stage), tokens, co-applicants, guarantors, additional docs

-- =============================================================
-- 1. Listings
-- =============================================================
CREATE TABLE listings (
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

CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_listings_org ON listings(org_id);
CREATE INDEX idx_listings_unit ON listings(unit_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_slug ON listings(public_slug);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_listings" ON listings
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "public_listing_view" ON listings
  FOR SELECT USING (status = 'active');

-- =============================================================
-- 2. Applications (two-stage model)
-- =============================================================
CREATE TABLE applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  listing_id            uuid NOT NULL REFERENCES listings(id),
  unit_id               uuid NOT NULL REFERENCES units(id),

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

  -- Motivation field (ADDENDUM_MOTIVATION_FIELD)
  applicant_motivation      text,
  motivation_doc_path       text,
  motivation_doc_type       text,
  motivation_submitted_at   timestamptz,

  -- Foreign national fields (ADDENDUM_FOREIGN_NATIONALS)
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

  -- Joint application (ADDENDUM_JOINT_APPLICATION)
  has_co_applicant          boolean DEFAULT false,
  co_applicants_count       integer DEFAULT 0,
  combined_income_cents     integer,
  combined_affordability_ratio numeric(5,4),
  combined_prescreen_score  integer,
  joint_fee_paid            boolean DEFAULT false,
  joint_fee_amount_cents    integer,
  joint_payfast_payment_id  text,

  -- ── STAGE 1 STATUS ──────────────────────────────────
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

  -- ── STAGE 2 STATUS ──────────────────────────────────
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

  -- Searchworx (Stage 2 — Phase 2 API default)
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

  -- If approved → tenant created
  tenant_id                 uuid REFERENCES tenants(id),

  -- Waitlist
  waitlist_priority         integer DEFAULT 999,

  -- Immigration compliance gate (foreign nationals)
  immigration_compliance_confirmed boolean DEFAULT false,
  immigration_compliance_confirmed_by uuid REFERENCES auth.users(id),
  immigration_compliance_confirmed_at timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_applications_org ON applications(org_id);
CREATE INDEX idx_applications_listing ON applications(listing_id);
CREATE INDEX idx_applications_stage1 ON applications(stage1_status);
CREATE INDEX idx_applications_stage2 ON applications(stage2_status);
CREATE INDEX idx_applications_fitscore ON applications(fitscore DESC NULLS LAST);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_applications" ON applications
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- =============================================================
-- 3. Application access tokens (no Pleks account needed)
-- =============================================================
CREATE TABLE application_tokens (
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

CREATE INDEX idx_app_tokens_token ON application_tokens(token);

ALTER TABLE application_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_app_tokens" ON application_tokens
  FOR ALL USING (
    application_id IN (SELECT id FROM applications WHERE org_id IN (
      SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
    ))
  );

-- =============================================================
-- 4. Co-applicants (ADDENDUM_JOINT_APPLICATION)
-- =============================================================
CREATE TABLE application_co_applicants (
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

CREATE INDEX idx_co_applicants_primary ON application_co_applicants(primary_application_id);

ALTER TABLE application_co_applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_co_applicants" ON application_co_applicants
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- =============================================================
-- 5. Guarantors (ADDENDUM_FOREIGN_NATIONALS)
-- =============================================================
CREATE TABLE application_guarantors (
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

CREATE INDEX idx_guarantors_application ON application_guarantors(application_id);

ALTER TABLE application_guarantors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_guarantors" ON application_guarantors
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- =============================================================
-- 6. Additional financial documents (ADDENDUM_JOINT_APPLICATION)
-- =============================================================
CREATE TABLE application_additional_docs (
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

CREATE INDEX idx_additional_docs_application ON application_additional_docs(application_id);

ALTER TABLE application_additional_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_additional_docs" ON application_additional_docs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
