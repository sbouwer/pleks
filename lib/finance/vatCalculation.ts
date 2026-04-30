/**
 * lib/finance/vatCalculation.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
