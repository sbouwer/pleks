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
