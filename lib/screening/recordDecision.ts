/**
 * lib/screening/recordDecision.ts — pure helpers for the F3 decision-accountability write-path
 *
 * Data:   no DB access — validation + payload construction only. The "use server" orchestration that
 *         calls these (resolve policy, write columns, capture audit id) lives in applicationActions.ts.
 * Notes:  F3 amendment §2.1c (ratios) + §9 (agent-discretion controls 1-3). Criminal-record codes are
 *         REJECTED at this layer — criminal screening is out of Pleks scope (INDEX 14E); the DB CHECK
 *         (applications_criminal_policy_required_check) is the immovable backstop. Control #4
 *         (manager-review) is NOT a blocking gate — it is reinterpreted as a dashboard rate metric
 *         (CD ruling 2026-06-17); see lib/dashboard discretion-rate surfacing.
 */
import type { ComponentSnapshot } from "./fitScoreEngine.v1"
import {
  DECLINE_REASON_CODES,
  ADVERSE_FACTOR_CODES,
  DECLINE_AGENT_DISCRETION_CODE,
  DECLINE_CRIMINAL_RECORD_CODE,
  type DeclineReasonCode,
  type AdverseFactorCode,
} from "./decisionReasons"

/** Minimum characters for an agent-discretion explanation (control 2). CD lean; counsel may revise. */
export const DISCRETION_MIN_TEXT_LENGTH = 100

const ADVERSE_CRIMINAL_CODE: AdverseFactorCode = "adverse_criminal_record_relevant"

/** Capacity in which the deciding agent acted (applications_deciding_agent_capacity_check). */
export const DECIDING_AGENT_CAPACITIES = ["agent_under_mandate", "landlord_direct", "pleks_platform_admin"] as const
export type DecidingAgentCapacity = (typeof DECIDING_AGENT_CAPACITIES)[number]
export const DEFAULT_DECIDING_AGENT_CAPACITY: DecidingAgentCapacity = "agent_under_mandate"

export interface DeclineDecisionInput {
  declineReasonCode: DeclineReasonCode
  adverseFactorCodes?: AdverseFactorCode[]
  /** required (non-empty, ≥100 chars) when declineReasonCode is the agent-discretion code. */
  declineReasonText?: string | null
}

export interface DecisionValidationError {
  field: "declineReasonCode" | "adverseFactorCodes" | "declineReasonText"
  message: string
}

const DECLINE_SET = new Set<string>(DECLINE_REASON_CODES)
const ADVERSE_SET = new Set<string>(ADVERSE_FACTOR_CODES)

/**
 * Validate a decline decision against the counsel-signed rules. Returns the first error, or null if valid.
 * Enforces: known codes; criminal-record rejection (out of scope); agent-discretion controls 1-2
 * (mandatory + ≥100-char free-text). Control 3 (dedicated audit row) and the rate metric are write-side.
 */
export function validateDeclineDecision(input: DeclineDecisionInput): DecisionValidationError | null {
  if (!DECLINE_SET.has(input.declineReasonCode)) {
    return { field: "declineReasonCode", message: "Select a valid decline reason." }
  }
  const adverse = input.adverseFactorCodes ?? []
  for (const code of adverse) {
    if (!ADVERSE_SET.has(code)) return { field: "adverseFactorCodes", message: `Unknown adverse factor: ${code}` }
  }

  // Criminal-record codes are not selectable — criminal screening is out of Pleks scope (INDEX 14E).
  if (input.declineReasonCode === DECLINE_CRIMINAL_RECORD_CODE || adverse.includes(ADVERSE_CRIMINAL_CODE)) {
    return { field: "declineReasonCode", message: "Criminal-record screening is not available in Pleks." }
  }

  // Agent-discretion controls 1 + 2.
  if (input.declineReasonCode === DECLINE_AGENT_DISCRETION_CODE) {
    const text = (input.declineReasonText ?? "").trim()
    if (text.length === 0) {
      return { field: "declineReasonText", message: "A written explanation is required for a discretionary decline." }
    }
    if (text.length < DISCRETION_MIN_TEXT_LENGTH) {
      return { field: "declineReasonText", message: `Explanation must be at least ${DISCRETION_MIN_TEXT_LENGTH} characters (currently ${text.length}).` }
    }
  }
  return null
}

/** True when the decline carries the agent-discretion code (drives the dedicated audit row, control 3). */
export function isDiscretionDecline(code: DeclineReasonCode): boolean {
  return code === DECLINE_AGENT_DISCRETION_CODE
}

export interface DecisionRatios {
  rent_to_income_ratio_at_decision: number | null
  dti_ratio_at_decision: number | null
  affordability_threshold_at_decision: number | null
  income_verification_status_at_decision: "verified" | "partially_verified" | "unverifiable" | null
}

/**
 * Derive the §2.1c per-decision ratios from the persisted FitScore component snapshot + the active policy
 * threshold. These are bounded, non-PII metrics retained 5y as decision-accountability.
 *
 *  - rent_to_income: read straight from the snapshot's lease ratio (the figure the agent saw).
 *  - affordability_threshold: the org's active-policy threshold at decision time.
 *  - dti: NULL — there is no DTI computation upstream yet (documented gap; wire when the input lands).
 *  - income_verification_status: derived from how many applicants had verified income (no fuzzy grade).
 */
export function extractDecisionRatios(
  snapshot: ComponentSnapshot | null | undefined,
  affordabilityThreshold: number | null,
): DecisionRatios {
  const ratio = snapshot?.lease?.rentToIncomeRatio
  const applicants = snapshot?.applicants ?? []
  const verifiedCount = applicants.filter((a) => (a?.verifiedIncomeCents ?? 0) > 0).length

  let incomeStatus: DecisionRatios["income_verification_status_at_decision"] = null
  if (applicants.length > 0) {
    if (verifiedCount === 0) incomeStatus = "unverifiable"
    else if (verifiedCount === applicants.length) incomeStatus = "verified"
    else incomeStatus = "partially_verified"
  }

  return {
    rent_to_income_ratio_at_decision: typeof ratio === "number" && Number.isFinite(ratio) ? ratio : null,
    dti_ratio_at_decision: null,
    affordability_threshold_at_decision: affordabilityThreshold,
    income_verification_status_at_decision: incomeStatus,
  }
}
