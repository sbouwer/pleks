/**
 * lib/leases/cpaRenewal.test.ts — the CPA s14(2)(b)(ii) notice date is business days, mid-window, fail-safe
 *
 * These pin the three things the old inline computations each got wrong: the UNIT (business days, not
 * calendar), the COUNT (inside 40–80, not 40 calendar ≈ 27 business or 28 calendar or 20 business), and the
 * horizon posture (display degrades to null; the firing path's strict walker throws).
 */
import { describe, it, expect } from "vitest"
import { cpaRenewalNoticeDue, cpaRenewalNoticeDueSafe, CPA_S14_NOTICE_BUSINESS_DAYS } from "./cpaRenewal"
import { subtractBusinessDaysStrict } from "@/lib/dates"

describe("cpaRenewalNoticeDue — statutory, mid-window", () => {
  it("targets the middle of the 40–80 business-day window", () => {
    expect(CPA_S14_NOTICE_BUSINESS_DAYS).toBe(60)
  })

  it("computes the live non-compliant lease correctly (c7b4a009, end 2027-06-29)", () => {
    // The stored value was 2027-05-20 (40 CALENDAR days = 27 business days — 13 short of the floor).
    // The lawful answer is 60 business days before expiry.
    expect(cpaRenewalNoticeDue("2027-06-29")).toBe("2027-04-02")
  })

  it("always lands inside the statutory window [80bd, 40bd] before expiry", () => {
    for (const end of ["2026-09-24", "2027-01-15", "2027-06-29", "2027-11-30"]) {
      const due = cpaRenewalNoticeDue(end)
      const earliest = subtractBusinessDaysStrict(end, 80)  // 80 bd before = window opens
      const latest = subtractBusinessDaysStrict(end, 40)    // 40 bd before = statutory floor
      expect(due >= earliest && due <= latest).toBe(true)
    }
  })

  it("throws past the holiday horizon (fail closed — the firing path must not compute against unknowns)", () => {
    expect(() => cpaRenewalNoticeDue("2029-06-30")).toThrow(/outside the SA public-holiday table/)
  })
})

describe("cpaRenewalNoticeDueSafe — display, degrades to null", () => {
  it("matches the strict computation inside the horizon", () => {
    expect(cpaRenewalNoticeDueSafe("2027-06-29")).toBe("2027-04-02")
  })

  it("returns null instead of throwing past the horizon (a 2029 lease must not blank the page)", () => {
    expect(cpaRenewalNoticeDueSafe("2029-06-30")).toBeNull()
  })

  it("returns null for a null / empty end date", () => {
    expect(cpaRenewalNoticeDueSafe(null)).toBeNull()
    expect(cpaRenewalNoticeDueSafe("")).toBeNull()
  })
})
