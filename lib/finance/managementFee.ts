/**
 * lib/finance/managementFee.ts — agency management-fee + VAT computation (pure)
 *
 * Data:  inputs from the lease fee config (percent or fixed) + rent collected; integer-cent money math.
 * Notes: VAT goes through the single calculateVAT() path (F-6) so fee+VAT can't diverge by a cent on a recalc.
 *        Rounding convention = round-half-away-from-zero (JS Math.round) on cents — see vatCalculation.ts.
 */
import { calculateVAT } from "@/lib/finance/vatCalculation"

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
  const feeExclVat = feeType === "fixed"
    ? (feeFixedCents ?? 0)
    : Math.round(rentCollectedCents * (feePercent / 100))

  const { vatAmount, inclVat } = calculateVAT(feeExclVat, vatApplicable)
  return { feeExclVat, vatAmount, feeInclVat: inclVat }
}
