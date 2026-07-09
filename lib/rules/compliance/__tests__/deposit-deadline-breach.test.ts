import { describe, it, expect } from "vitest"
import { resolveDepositReturnDays, depositDeadline, moveOutConductedDate } from "../deposit-deadline-breach"

const DAY_MS = 86_400_000
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY_MS)

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

describe("moveOutConductedDate — restoration anchor extraction (O-21)", () => {
  it("returns conducted_date when the linked inspection is the move-out one", () => {
    expect(moveOutConductedDate({ conducted_date: "2026-03-10", inspection_type: "move_out" })).toBe("2026-03-10")
  })
  it("returns null when there is no linked inspection", () => {
    expect(moveOutConductedDate(null)).toBeNull()
  })
  it("ignores a non-move-out inspection — recon.inspection_id can point at any type", () => {
    expect(moveOutConductedDate({ conducted_date: "2026-03-10", inspection_type: "move_in" })).toBeNull()
  })
})

describe("depositDeadline — restoration anchor swap (O-21)", () => {
  const damages = { total_deductions_cents: 150_00, inspection_id: "insp-1" } // s5(7): 14-day window

  it("s5(7): counts the 14-day window from the move-out inspection date, not lease end", () => {
    // early handback: restored 2026-03-01, lease only ends 2026-03-31
    const deadline = depositDeadline("2026-03-31", "2026-03-01", damages)
    expect(daysBetween(deadline, new Date("2026-03-01"))).toBe(14)
  })

  it("early handback makes the deadline EARLIER than lease-end+14 (fires on time, never late)", () => {
    const anchored = depositDeadline("2026-03-31", "2026-03-01", damages)
    const flat     = depositDeadline("2026-03-31", null, damages)
    expect(anchored.getTime()).toBeLessThan(flat.getTime())
  })

  it("falls back to lease end + window when no move-out inspection is linked", () => {
    const deadline = depositDeadline("2026-03-31", null, damages)
    expect(daysBetween(deadline, new Date("2026-03-31"))).toBe(14)
  })
})
