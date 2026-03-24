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
