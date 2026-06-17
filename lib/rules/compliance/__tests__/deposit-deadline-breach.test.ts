import { describe, it, expect } from "vitest"
import { resolveDepositReturnDays } from "../deposit-deadline-breach"

describe("resolveDepositReturnDays — RHA deposit-return matrix (O-15)", () => {
  it("no deductions + a joint inspection happened → s5(3)(g)(i): 7 days", () => {
    expect(resolveDepositReturnDays({ total_deductions_cents: 0, inspection_id: "insp-1" }))
      .toEqual({ days: 7, scenario: "no_damage_inspected" })
  })

  it("no deductions + no inspection (landlord failed to inspect) → s5(3)(g)(ii): 14 days, full refund", () => {
    expect(resolveDepositReturnDays({ total_deductions_cents: 0, inspection_id: null }))
      .toEqual({ days: 14, scenario: "no_inspection" })
  })

  it("deductions claimed → s5(7): 14 days (early bound; restoration date not captured)", () => {
    expect(resolveDepositReturnDays({ total_deductions_cents: 150_00, inspection_id: "insp-1" }))
      .toEqual({ days: 14, scenario: "damages_claimed" })
  })

  it("treats missing/null deductions as zero (defensive)", () => {
    expect(resolveDepositReturnDays({ inspection_id: "insp-1" }).days).toBe(7)
    expect(resolveDepositReturnDays({ total_deductions_cents: null, inspection_id: null }).days).toBe(14)
  })

  it("the 7-day no-damage case is the one the old flat-14 missed by a week", () => {
    // Regression guard: a clean, inspected deposit must breach at 7 days, not 14.
    expect(resolveDepositReturnDays({ total_deductions_cents: 0, inspection_id: "insp-1" }).days).toBeLessThan(14)
  })
})
