/**
 * lib/deposits/__tests__/depositBalance.test.ts — the signed-sum is money + Tribunal-sensitive (CD D-2)
 */
import { describe, it, expect } from "vitest"
import { depositSignedSum } from "../depositBalance"

describe("depositSignedSum", () => {
  it("adds credits, subtracts debits", () => {
    // deposit received + interest accrued (credits) less a deduction applied (debit)
    expect(depositSignedSum([
      { amount_cents: 1_000_000, direction: "credit" },
      { amount_cents: 5_000, direction: "credit" },
      { amount_cents: 200_000, direction: "debit" },
    ])).toBe(805_000)
  })

  it("is 0 for no transactions (never throws)", () => {
    expect(depositSignedSum([])).toBe(0)
  })

  it("a lone debit is negative (money out)", () => {
    expect(depositSignedSum([{ amount_cents: 100, direction: "debit" }])).toBe(-100)
  })

  it("a full deduction returns a zero balance", () => {
    expect(depositSignedSum([
      { amount_cents: 500_000, direction: "credit" },
      { amount_cents: 500_000, direction: "debit" },
    ])).toBe(0)
  })
})
