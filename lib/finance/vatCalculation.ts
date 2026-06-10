/**
 * lib/finance/vatCalculation.ts — single VAT computation path for SA 15% VAT (pure)
 *
 * Data:  pure functions; integer-cent money math.
 * Notes: THE one place VAT is rounded — every caller (management fee, supplier invoices) must route through
 *        calculateVAT so fee+VAT can't diverge by a cent on a recalc path (F-6). Money convention across the
 *        finance lib: integer cents, rounded round-half-away-from-zero (JS Math.round); interest day-count is
 *        a fixed /365 divisor (see depositInterest.ts / arrears). Also exposes generateEFTReference.
 */
export const SA_VAT_RATE = 0.15

export function calculateVAT(
  amountExclVatCents: number,
  vatRegistered: boolean
): {
  exclVat: number
  vatAmount: number
  inclVat: number
} {
  if (!vatRegistered) {
    return {
      exclVat: amountExclVatCents,
      vatAmount: 0,
      inclVat: amountExclVatCents,
    }
  }
  const vatAmount = Math.round(amountExclVatCents * SA_VAT_RATE)
  return {
    exclVat: amountExclVatCents,
    vatAmount,
    inclVat: amountExclVatCents + vatAmount,
  }
}

export function generateEFTReference(
  propertyAddress: string,
  workOrderNumber: string | null
): string {
  const propertyCode = propertyAddress.slice(0, 6).toUpperCase().replace(/\s/g, "")
  const jobRef = workOrderNumber ? `WO${workOrderNumber.slice(-4)}` : "SUPP"
  return `PLEKS-${propertyCode}-${jobRef}`.slice(0, 30)
}
