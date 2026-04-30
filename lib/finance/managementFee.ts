/**
 * lib/finance/managementFee.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
export function calculateManagementFee(
  rentCollectedCents: number,
  feePercent: number,
  feeType: string,
  feeFixedCents: number | null,
  vatApplicable: boolean
): {
  feeExclVat: number
  vatAmount: number
  feeInclVat: number
} {
  let feeExclVat: number

  if (feeType === "fixed") {
    feeExclVat = feeFixedCents ?? 0
  } else {
    feeExclVat = Math.round(rentCollectedCents * (feePercent / 100))
  }

  const vatAmount = vatApplicable ? Math.round(feeExclVat * 0.15) : 0

  return {
    feeExclVat,
    vatAmount,
    feeInclVat: feeExclVat + vatAmount,
  }
}
