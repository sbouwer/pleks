/**
 * lib/screening/combinedAffordability.ts — sum household incomes for combined affordability.
 *
 * Pure (no AI/IO). Primary + co-applicant incomes are summed (co-lessees share the rent); the caller excludes
 * guarantors (a backstop, scored separately via GUARANTOR_MIN_INCOME_MULTIPLE). Used by the Step-1 free assessment
 * (lib/applications/freeAssessment) and the Step-2 verified ruling. Returns combined income + rent-to-income ratio.
 *
 * `threshold` is the ORG'S affordability ceiling, resolved from its screening policy
 * (`resolveAffordabilityThreshold`), falling back to the platform constant. It was a bare `0.30` here —
 * the literal M-009 names — so an agency that authored 0.35 got a decision record certifying 0.35 while
 * this helper flagged at 0.30 and would not have moved even if the constant did. `affordabilityFlag` has
 * no consumer today (freeAssessment destructures only `{ combinedIncome, ratio }`), but it is an exported
 * field of a public return type, named identically to preScreenScore's correctly-derived one, and the
 * next caller would have taken it in good faith.
 */
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"

export function calculateCombinedAffordability(
  primaryIncomeCents: number | null,
  coApplicantIncomesCents: number[],
  rentCents: number,
  threshold: number = INCOME_AFFORDABILITY_THRESHOLD
): {
  primaryIncome: number
  coApplicantIncomes: number[]
  combinedIncome: number
  ratio: number | null
  affordabilityFlag: boolean
} {
  const primary = primaryIncomeCents ?? 0
  const combinedIncome = primary + coApplicantIncomesCents.reduce((a, b) => a + b, 0)
  const ratio = combinedIncome > 0 ? rentCents / combinedIncome : null
  const affordabilityFlag = ratio !== null && ratio > threshold

  return {
    primaryIncome: primary,
    coApplicantIncomes: coApplicantIncomesCents,
    combinedIncome,
    ratio,
    affordabilityFlag,
  }
}
