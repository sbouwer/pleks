/**
 * lib/screening/combinedAffordability.ts — sum household incomes for combined affordability.
 *
 * Pure (no AI/IO). Primary + co-applicant incomes are summed (co-lessees share the rent); the caller excludes
 * guarantors (a backstop, scored separately via GUARANTOR_MIN_INCOME_MULTIPLE). Used by the Step-1 free assessment
 * (lib/applications/freeAssessment) and the Step-2 verified ruling. Returns combined income + rent-to-income ratio.
 */
export function calculateCombinedAffordability(
  primaryIncomeCents: number | null,
  coApplicantIncomesCents: number[],
  rentCents: number
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
  const affordabilityFlag = ratio !== null && ratio > 0.30

  return {
    primaryIncome: primary,
    coApplicantIncomes: coApplicantIncomesCents,
    combinedIncome,
    ratio,
    affordabilityFlag,
  }
}
