/**
 * lib/screening/decisionReasonLabels.ts — plain-language labels for the F3 decision-reason codes
 *
 * Data:   pure constants. The agent-facing "standard replies": the decision modal renders these labels,
 *         not the raw enum slugs, so a standard decline is a one-click pick with zero free-text.
 * Notes:  Kept separate from decisionReasons.ts so the counsel-SIGNED enum values stay pure. The Record
 *         types are exhaustive over the code unions — if counsel adds a code at the annual review, this
 *         file fails to compile until the new code gets a label (the union-trap, used deliberately).
 */
import type {
  DeclineReasonCode,
  AdverseFactorCode,
  NotShortlistedReasonCode,
  WithdrawnReasonCode,
} from "./decisionReasons"

/** One label per decline code — the standard reasons shown in the picker. */
export const DECLINE_REASON_LABELS: Record<DeclineReasonCode, string> = {
  decline_credit_judgment: "Credit — civil judgment on record",
  decline_credit_default: "Credit — default listed",
  decline_credit_admin_order: "Credit — administration order",
  decline_credit_arrears_current: "Credit — currently in arrears",
  decline_credit_score_low: "Credit — score below threshold",
  decline_affordability_income_low: "Affordability — income below threshold",
  decline_affordability_dti_high: "Affordability — debt-to-income too high",
  decline_income_unverifiable: "Affordability — income could not be verified",
  decline_employment_tenure_below_threshold: "Employment — tenure below threshold",
  decline_employment_verification_incomplete: "Employment — employer could not be reached",
  decline_employment_denied_by_employer: "Employment — denied by employer",
  decline_identity_verification_failed: "Identity — verification failed",
  decline_documentation_incomplete: "Documents — incomplete",
  decline_documentation_invalid: "Documents — invalid",
  decline_right_to_occupy_unverifiable: "Right to occupy — could not be verified",
  decline_reference_landlord_negative: "Reference — landlord reference negative",
  decline_reference_landlord_unverifiable: "Reference — landlord could not be verified",
  decline_reference_employer_negative: "Reference — employer reference negative",
  decline_reference_employer_unverifiable: "Reference — employer could not be verified",
  decline_rental_history_arrears: "Rental history — prior arrears",
  decline_rental_history_eviction: "Rental history — prior eviction",
  decline_fitscore_hard_flag: "FitScore — critical hard flag",
  decline_fitscore_ldp_insufficient: "FitScore — insufficient data to assess",
  decline_criminal_record_relevant: "Criminal record — relevant (not available in Pleks)",
  decline_director_disqualified: "Commercial — director disqualified",
  decline_commercial_composite_below_threshold: "Commercial — composite below threshold",
  decline_property_no_longer_available: "Operational — property no longer available",
  decline_agent_discretion_documented: "Agent discretion (other) — requires a written explanation",
}

/** One label per adverse-factor code — the contributing factors (optional, multi-select). */
export const ADVERSE_FACTOR_LABELS: Record<AdverseFactorCode, string> = {
  adverse_judgment_civil: "Civil judgment",
  adverse_judgment_default: "Judgment by default",
  adverse_admin_order: "Administration order",
  adverse_sequestration: "Sequestration",
  adverse_arrears_current: "Current arrears",
  adverse_arrears_historical: "Historical arrears",
  adverse_score_low_bureau: "Low bureau score",
  adverse_inquiry_velocity_high: "High credit-inquiry velocity",
  adverse_utilization_high: "High credit utilisation",
  adverse_income_below_threshold: "Income below threshold",
  adverse_income_unverifiable: "Income unverifiable",
  adverse_dti_above_threshold: "Debt-to-income above threshold",
  adverse_disposable_income_low: "Low disposable income",
  adverse_bank_statement_irregular: "Irregular bank statement",
  adverse_bank_statement_missing: "Bank statement missing",
  adverse_employment_short_tenure: "Short employment tenure",
  adverse_employment_unverifiable: "Employment unverifiable",
  adverse_employment_denied: "Employment denied by employer",
  adverse_self_employed_thin_documentation: "Self-employed — thin documentation",
  adverse_id_number_mismatch: "ID number mismatch",
  adverse_id_document_invalid: "ID document invalid",
  adverse_permit_expired: "Permit expired",
  adverse_permit_short_term: "Permit short-term",
  adverse_permit_unauthorised_for_residence: "Permit not authorised for residence",
  adverse_landlord_reference_negative: "Landlord reference negative",
  adverse_landlord_reference_unverifiable: "Landlord reference unverifiable",
  adverse_employer_reference_negative: "Employer reference negative",
  adverse_employer_reference_unverifiable: "Employer reference unverifiable",
  adverse_rental_arrears_recorded: "Rental arrears recorded",
  adverse_rental_eviction_recorded: "Eviction recorded",
  adverse_lease_break_pattern: "Pattern of lease breaks",
  adverse_fitscore_band_adverse: "FitScore band — adverse",
  adverse_fitscore_band_limited: "FitScore band — limited",
  adverse_fitscore_hard_flag_critical: "FitScore — critical hard flag",
  adverse_fitscore_hard_flag_trust_network: "FitScore — trust-network flag",
  adverse_fitscore_hard_flag_capping: "FitScore — capping flag",
  adverse_fitscore_ldp_insufficient_dimensions: "FitScore — insufficient dimensions",
  adverse_composite_risk_assessment: "Composite risk assessment",
  adverse_criminal_record_relevant: "Criminal record relevant (not available in Pleks)",
  adverse_documentation_incomplete: "Documentation incomplete",
  adverse_documentation_invalid: "Documentation invalid",
  adverse_director_disqualified_cipc: "Director disqualified (CIPC)",
  adverse_entity_credit_low: "Entity credit low",
  adverse_director_individual_fitscore_low: "Director individual FitScore low",
}

export const NOT_SHORTLISTED_REASON_LABELS: Record<NotShortlistedReasonCode, string> = {
  not_shortlisted_other_applicant_selected: "Another applicant was selected",
  not_shortlisted_no_decision_provided: "No decision recorded",
  not_shortlisted_property_withdrawn: "Property withdrawn",
  not_shortlisted_property_changed: "Property details changed",
  not_shortlisted_expired_unactioned: "Expired without action",
}

export const WITHDRAWN_REASON_LABELS: Record<WithdrawnReasonCode, string> = {
  withdrawn_applicant_initiated: "Applicant withdrew",
  withdrawn_applicant_unreachable: "Applicant unreachable",
  withdrawn_alternate_property: "Applicant took an alternate property",
}
