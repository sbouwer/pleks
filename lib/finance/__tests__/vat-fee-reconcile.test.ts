/**
 * lib/finance/__tests__/vat-fee-reconcile.test.ts — VAT + fee money-math reconciliation (F-6)
 *
 * Guards the single-VAT-path invariant: management fee VAT must equal calculateVAT (no independent rounding),
 * and incl = excl + vat to the cent across boundary amounts.
 */
import { describe, it, expect } from "vitest"
import { calculateVAT, SA_VAT_RATE } from "@/lib/finance/vatCalculation"
import { calculateManagementFee } from "@/lib/finance/managementFee"

describe("VAT + fee money math (F-6)", () => {
  it("SA_VAT_RATE is 15%", () => expect(SA_VAT_RATE).toBe(0.15))

  it("calculateVAT rounds to the cent (round-half-away-from-zero) and skips when not registered", () => {
    expect(calculateVAT(10, true).vatAmount).toBe(2)            // 1.5 → 2
    expect(calculateVAT(100, true)).toEqual({ exclVat: 100, vatAmount: 15, inclVat: 115 })
    expect(calculateVAT(100, false)).toEqual({ exclVat: 100, vatAmount: 0, inclVat: 100 })
    expect(calculateVAT(0, true).vatAmount).toBe(0)
  })

  it("inclVat always reconciles to excl + vat", () => {
    for (const amt of [1, 7, 33, 99, 100, 12_345, 999_999]) {
      const r = calculateVAT(amt, true)
      expect(r.inclVat).toBe(r.exclVat + r.vatAmount)
    }
  })

  it("management fee VAT routes through the single calculateVAT path (no divergence)", () => {
    const fee = calculateManagementFee(1_000_000, 8, "percent", null, true)
    const expected = calculateVAT(80_000, true)
    expect(fee).toEqual({ feeExclVat: 80_000, vatAmount: expected.vatAmount, feeInclVat: expected.inclVat })

    expect(calculateManagementFee(0, 0, "fixed", 50_000, false))
      .toEqual({ feeExclVat: 50_000, vatAmount: 0, feeInclVat: 50_000 })
  })
})
