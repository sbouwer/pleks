-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_F3_DECISION_REASONS: code-typed decision/adverse-factor fields
--     GENERATED from lib/screening/decisionReasons.ts — do not hand-edit (edit the TS + re-run
--     scripts/codegen/decision-reason-enums.mts). Values are CD-draft; APPLY ONLY after counsel ticks.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS decline_reason_code text,
  ADD COLUMN IF NOT EXISTS adverse_factor_codes text[],
  ADD COLUMN IF NOT EXISTS not_shortlisted_reason_code text,
  ADD COLUMN IF NOT EXISTS withdrawn_reason_code text;

ALTER TABLE application_co_applicants
  ADD COLUMN IF NOT EXISTS decline_reason_code text,
  ADD COLUMN IF NOT EXISTS adverse_factor_codes text[];

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_decline_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_decline_reason_code_check CHECK (
  decline_reason_code IS NULL OR decline_reason_code IN (
    'decline_credit_judgment',
    'decline_credit_default',
    'decline_credit_admin_order',
    'decline_credit_arrears_current',
    'decline_credit_score_low',
    'decline_affordability_income_low',
    'decline_affordability_dti_high',
    'decline_income_unverifiable',
    'decline_employment_tenure_below_threshold',
    'decline_employment_verification_incomplete',
    'decline_employment_denied_by_employer',
    'decline_identity_verification_failed',
    'decline_documentation_incomplete',
    'decline_documentation_invalid',
    'decline_right_to_occupy_unverifiable',
    'decline_reference_landlord_negative',
    'decline_reference_landlord_unverifiable',
    'decline_reference_employer_negative',
    'decline_reference_employer_unverifiable',
    'decline_rental_history_arrears',
    'decline_rental_history_eviction',
    'decline_fitscore_hard_flag',
    'decline_fitscore_ldp_insufficient',
    'decline_criminal_record_relevant',
    'decline_director_disqualified',
    'decline_commercial_composite_below_threshold',
    'decline_property_no_longer_available',
    'decline_agent_discretion_documented'
  )
);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_not_shortlisted_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_not_shortlisted_reason_code_check CHECK (
  not_shortlisted_reason_code IS NULL OR not_shortlisted_reason_code IN (
    'not_shortlisted_other_applicant_selected',
    'not_shortlisted_no_decision_provided',
    'not_shortlisted_property_withdrawn',
    'not_shortlisted_property_changed',
    'not_shortlisted_expired_unactioned'
  )
);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_withdrawn_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_withdrawn_reason_code_check CHECK (
  withdrawn_reason_code IS NULL OR withdrawn_reason_code IN (
    'withdrawn_applicant_initiated',
    'withdrawn_applicant_unreachable',
    'withdrawn_alternate_property'
  )
);

CREATE OR REPLACE FUNCTION is_valid_adverse_factor_code(p_code text)
RETURNS boolean AS $$
BEGIN
  RETURN p_code IN (
    'adverse_judgment_civil',
    'adverse_judgment_default',
    'adverse_admin_order',
    'adverse_sequestration',
    'adverse_arrears_current',
    'adverse_arrears_historical',
    'adverse_score_low_bureau',
    'adverse_inquiry_velocity_high',
    'adverse_utilization_high',
    'adverse_income_below_threshold',
    'adverse_income_unverifiable',
    'adverse_dti_above_threshold',
    'adverse_disposable_income_low',
    'adverse_bank_statement_irregular',
    'adverse_bank_statement_missing',
    'adverse_employment_short_tenure',
    'adverse_employment_unverifiable',
    'adverse_employment_denied',
    'adverse_self_employed_thin_documentation',
    'adverse_id_number_mismatch',
    'adverse_id_document_invalid',
    'adverse_permit_expired',
    'adverse_permit_short_term',
    'adverse_permit_unauthorised_for_residence',
    'adverse_landlord_reference_negative',
    'adverse_landlord_reference_unverifiable',
    'adverse_employer_reference_negative',
    'adverse_employer_reference_unverifiable',
    'adverse_rental_arrears_recorded',
    'adverse_rental_eviction_recorded',
    'adverse_lease_break_pattern',
    'adverse_fitscore_band_adverse',
    'adverse_fitscore_band_limited',
    'adverse_fitscore_hard_flag_critical',
    'adverse_fitscore_hard_flag_trust_network',
    'adverse_fitscore_hard_flag_capping',
    'adverse_fitscore_ldp_insufficient_dimensions',
    'adverse_composite_risk_assessment',
    'adverse_criminal_record_relevant',
    'adverse_documentation_incomplete',
    'adverse_documentation_invalid',
    'adverse_director_disqualified_cipc',
    'adverse_entity_credit_low',
    'adverse_director_individual_fitscore_low'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Array wrapper: a CHECK constraint cannot contain a subquery, so the per-element validation lives in
-- this function (subqueries ARE allowed inside a function body) and the CHECK calls it scalar-wise.
CREATE OR REPLACE FUNCTION is_valid_adverse_factor_array(p_codes text[])
RETURNS boolean AS $$
BEGIN
  RETURN p_codes IS NULL OR (SELECT bool_and(is_valid_adverse_factor_code(c)) FROM unnest(p_codes) AS c);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_adverse_factor_codes_check;
ALTER TABLE applications ADD CONSTRAINT applications_adverse_factor_codes_check CHECK (
  is_valid_adverse_factor_array(adverse_factor_codes)
);

ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_decline_reason_code_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_decline_reason_code_check CHECK (
  decline_reason_code IS NULL OR decline_reason_code IN (
    'decline_credit_judgment',
    'decline_credit_default',
    'decline_credit_admin_order',
    'decline_credit_arrears_current',
    'decline_credit_score_low',
    'decline_affordability_income_low',
    'decline_affordability_dti_high',
    'decline_income_unverifiable',
    'decline_employment_tenure_below_threshold',
    'decline_employment_verification_incomplete',
    'decline_employment_denied_by_employer',
    'decline_identity_verification_failed',
    'decline_documentation_incomplete',
    'decline_documentation_invalid',
    'decline_right_to_occupy_unverifiable',
    'decline_reference_landlord_negative',
    'decline_reference_landlord_unverifiable',
    'decline_reference_employer_negative',
    'decline_reference_employer_unverifiable',
    'decline_rental_history_arrears',
    'decline_rental_history_eviction',
    'decline_fitscore_hard_flag',
    'decline_fitscore_ldp_insufficient',
    'decline_criminal_record_relevant',
    'decline_director_disqualified',
    'decline_commercial_composite_below_threshold',
    'decline_property_no_longer_available',
    'decline_agent_discretion_documented'
  )
);

ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_adverse_factor_codes_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_adverse_factor_codes_check CHECK (
  is_valid_adverse_factor_array(adverse_factor_codes)
);

COMMENT ON COLUMN applications.decline_reason_code IS
  'Primary decline reason code (CD-canonical enum, counsel-confirmed). One per declined application. Retained 5 years post-decision as part of F3 structurally-typed accountability record.';
COMMENT ON COLUMN applications.adverse_factor_codes IS
  'Array of adverse factor codes contributing to the decision (CD-canonical enum, counsel-confirmed). Retained 5 years post-decision. Multiple codes per row allowed; ordering not significant.';
COMMENT ON COLUMN applications.decline_reason IS
  'DEPRECATED: free-text legacy field. Use decline_reason_code (categorical). Backfilled per SPEC §8. Dropped after backfill verified.';
COMMENT ON COLUMN applications.not_shortlisted_reason IS
  'DEPRECATED: free-text legacy field. Use not_shortlisted_reason_code (categorical). Dropped after backfill verified.';
COMMENT ON COLUMN application_co_applicants.decline_reason IS
  'DEPRECATED: free-text legacy field. Use decline_reason_code (categorical). Dropped after backfill verified.';
