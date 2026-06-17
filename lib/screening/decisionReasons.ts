/**
 * lib/screening/decisionReasons.ts — canonical decision-reason + adverse-factor enums (SPEC_DECISION_REASON_ENUMS)
 *
 * Data:   pure constants — no DB access. The SINGLE SOURCE OF TRUTH for the F3 retained-record code
 *         vocabulary. The DB CHECK constraints are GENERATED from these arrays (scripts/codegen/
 *         decision-reason-enums.mts → decision_reason_constraints.generated.sql); a drift test fails CI
 *         if the generated SQL and these arrays diverge.
 * Notes:  VALUES SIGNED by retained SA counsel (COUNSEL_BRIEF_F3_DISPOSITION pass 6, 2026-06-15 — "no
 *         structural legal impediment"). Reconciled from the original draft through passes 1/3/6: band
 *         codes decomposed to adverse factors (pass 1); employment/permit/reference renames + splits
 *         (pass 3); decline_composite_signals_aggregate removed + adverse_composite_risk_assessment added
 *         (pass 6). The generated CHECK SQL is paste-ready; the migration applies on Stéan's authorisation.
 *         decline_reason_text (agent-discretion free-text sibling) + criminal-policy linkage land with the
 *         migration's app-layer + hybrid-CHECK enforcement (amendment §2.1d), not in this enum.
 */

/** One code per declined application (SPEC §3). Flat enum; comments group conceptually. */
export const DECLINE_REASON_CODES = [
  // credit-based
  "decline_credit_judgment",
  "decline_credit_default",
  "decline_credit_admin_order",
  "decline_credit_arrears_current",
  "decline_credit_score_low",
  // affordability
  "decline_affordability_income_low",
  "decline_affordability_dti_high",
  "decline_income_unverifiable",
  "decline_employment_tenure_below_threshold",   // pass 3: renamed from _unstable (objective)
  "decline_employment_verification_incomplete",  // pass 3: split — employer unreachable
  "decline_employment_denied_by_employer",       // pass 3: split — affirmative denial
  // identity / documentation
  "decline_identity_verification_failed",
  "decline_documentation_incomplete",
  "decline_documentation_invalid",
  "decline_right_to_occupy_unverifiable",        // pass 3: renamed from decline_permit_status (right-to-occupy framing)
  // references
  "decline_reference_landlord_negative",
  "decline_reference_landlord_unverifiable",     // pass 3: renamed from _unreachable (verification-gap framing)
  "decline_reference_employer_negative",
  "decline_reference_employer_unverifiable",     // pass 3: added for parallel completeness
  // rental history
  "decline_rental_history_arrears",
  "decline_rental_history_eviction",
  // fitscore-derived (architectural states ONLY — band placements decomposed to adverse factors, pass 1;
  // decline_composite_signals_aggregate removed pass 6 — aggregates are never a primary reason)
  "decline_fitscore_hard_flag",
  "decline_fitscore_ldp_insufficient",
  // criminal record (Estate bundle only — cannot be the SOLE basis; app-layer enforced, SPEC §9-item-3)
  "decline_criminal_record_relevant",
  // commercial-applicant specific
  "decline_director_disqualified",
  "decline_commercial_composite_below_threshold",
  // operational / non-screening
  "decline_property_no_longer_available",
  "decline_agent_discretion_documented",
] as const
export type DeclineReasonCode = (typeof DECLINE_REASON_CODES)[number]

/** Multiple per row — the contributing factors that informed the decision (SPEC §4). */
export const ADVERSE_FACTOR_CODES = [
  // credit
  "adverse_judgment_civil",
  "adverse_judgment_default",
  "adverse_admin_order",
  "adverse_sequestration",
  "adverse_arrears_current",
  "adverse_arrears_historical",
  "adverse_score_low_bureau",
  "adverse_inquiry_velocity_high",
  "adverse_utilization_high",
  // affordability
  "adverse_income_below_threshold",
  "adverse_income_unverifiable",
  "adverse_dti_above_threshold",
  "adverse_disposable_income_low",
  "adverse_bank_statement_irregular",
  "adverse_bank_statement_missing",
  // employment
  "adverse_employment_short_tenure",
  "adverse_employment_unverifiable",
  "adverse_employment_denied",
  "adverse_self_employed_thin_documentation",
  // identity
  "adverse_id_number_mismatch",
  "adverse_id_document_invalid",
  "adverse_permit_expired",
  "adverse_permit_short_term",
  "adverse_permit_unauthorised_for_residence",
  // references
  "adverse_landlord_reference_negative",
  "adverse_landlord_reference_unverifiable",  // pass 3: renamed from _unreachable
  "adverse_employer_reference_negative",
  "adverse_employer_reference_unverifiable",  // pass 3: renamed from _unreachable
  // rental history
  "adverse_rental_arrears_recorded",
  "adverse_rental_eviction_recorded",
  "adverse_lease_break_pattern",
  // fitscore-derived
  "adverse_fitscore_band_adverse",
  "adverse_fitscore_band_limited",
  "adverse_fitscore_hard_flag_critical",
  "adverse_fitscore_hard_flag_trust_network",
  "adverse_fitscore_hard_flag_capping",
  "adverse_fitscore_ldp_insufficient_dimensions",
  "adverse_composite_risk_assessment",  // pass 6: replaces the removed decline_composite_signals_aggregate (adverse-only; never primary)
  // criminal record (Estate bundle only)
  "adverse_criminal_record_relevant",
  // documentation
  "adverse_documentation_incomplete",
  "adverse_documentation_invalid",
  // commercial-applicant
  "adverse_director_disqualified_cipc",
  "adverse_entity_credit_low",
  "adverse_director_individual_fitscore_low",
] as const
export type AdverseFactorCode = (typeof ADVERSE_FACTOR_CODES)[number]

/** Non-defence-load-bearing outcomes (SPEC §5). */
export const NOT_SHORTLISTED_REASON_CODES = [
  "not_shortlisted_other_applicant_selected",
  "not_shortlisted_no_decision_provided",
  "not_shortlisted_property_withdrawn",
  "not_shortlisted_property_changed",
  "not_shortlisted_expired_unactioned",
] as const
export type NotShortlistedReasonCode = (typeof NOT_SHORTLISTED_REASON_CODES)[number]

/** Applicant-initiated withdrawal (SPEC §6). */
export const WITHDRAWN_REASON_CODES = [
  "withdrawn_applicant_initiated",
  "withdrawn_applicant_unreachable",
  "withdrawn_alternate_property",
] as const
export type WithdrawnReasonCode = (typeof WITHDRAWN_REASON_CODES)[number]

/** The agent-discretion code whose decline carries a free-text sibling (SPEC §9-item-1, counsel-pending). */
export const DECLINE_AGENT_DISCRETION_CODE: DeclineReasonCode = "decline_agent_discretion_documented"

/** Criminal-record code that may not be the SOLE decline basis (SPEC §9-item-3, app-layer enforced). */
export const DECLINE_CRIMINAL_RECORD_CODE: DeclineReasonCode = "decline_criminal_record_relevant"
