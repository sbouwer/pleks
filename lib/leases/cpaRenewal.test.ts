/**
 * lib/leases/cpaRenewal.test.ts — the CPA s14(2)(b)(ii) notice date is business days, mid-window, fail-safe
 *
 * These pin the three things the old inline computations each got wrong: the UNIT (business days, not
 * calendar), the COUNT (inside 40–80, not 40 calendar ≈ 27 business or 28 calendar or 20 business), and the
 * horizon posture (display degrades to null; the firing path's strict walker throws).
 */
import { describe, it, expect } from "vitest"
import {
  cpaRenewalNoticeDue, cpaRenewalNoticeDueSafe, CPA_S14_NOTICE_BUSINESS_DAYS,
  cpaRenewalNoticeFloor, cpaRenewalNoticeFloorSafe, CPA_S14_NOTICE_FLOOR_BUSINESS_DAYS,
  isRenewalNoticeMissed,
  HOLIDAY_HORIZON_WARN_DAYS, CPA_RENEWAL_CANDIDATE_BAND_DAYS,
} from "./cpaRenewal"
import { subtractBusinessDaysStrict, addCalendarDays } from "@/lib/dates"

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

describe("cpaRenewalNoticeFloor — the 40-bd floor (last lawful send day), distinct from the 60-bd target", () => {
  it("is the 40-business-day floor, not the 60-bd target", () => {
    expect(CPA_S14_NOTICE_FLOOR_BUSINESS_DAYS).toBe(40)
    expect(cpaRenewalNoticeFloor("2027-06-29")).toBe(subtractBusinessDaysStrict("2027-06-29", 40))
  })

  it("falls STRICTLY LATER than the due target — so a 'missed' check on the floor cannot fire while the window is open", () => {
    // The floor (40 bd before expiry) is closer to expiry than the 60-bd target → a later calendar date.
    for (const end of ["2026-09-24", "2027-01-15", "2027-06-29", "2027-11-30"]) {
      expect(cpaRenewalNoticeFloor(end) > cpaRenewalNoticeDue(end)).toBe(true)
    }
  })

  it("degrades to null past the horizon and on null/empty (display shape)", () => {
    expect(cpaRenewalNoticeFloorSafe("2029-06-30")).toBeNull()
    expect(cpaRenewalNoticeFloorSafe(null)).toBeNull()
    expect(cpaRenewalNoticeFloorSafe("")).toBeNull()
  })

  it("the MISSED window: a lease still inside its lawful window is NOT past the floor (regression guard for the calendar alert)", () => {
    // A lease whose 40-bd floor is in the future is NOT missed; the old bug fired MISSED off the 60-bd target,
    // which for such a lease is already in the past — the exact false-positive this guards.
    const end = "2027-06-29"
    const floor = cpaRenewalNoticeFloorSafe(end)!
    const target = cpaRenewalNoticeDueSafe(end)!
    // Pick a "today" between target and floor: past the reminder, still inside the lawful window.
    const today = subtractBusinessDaysStrict(end, 50)  // 50 bd out: past 60-bd target, before 40-bd floor
    expect(today > target).toBe(true)         // reminder has fired
    expect(today < floor).toBe(true)          // but the floor has NOT passed → NOT missed
  })
})

describe("isRenewalNoticeMissed — the boundary is STRICT, locked here so it can't slip to <=", () => {
  const floor = cpaRenewalNoticeFloorSafe("2027-06-29")!  // the 40-bd floor date

  it("is NOT missed ON the floor day itself — serving on the 40-bd floor satisfies 'not less than 40 business days'", () => {
    expect(isRenewalNoticeMissed(floor, floor)).toBe(false)
  })

  it("IS missed the calendar day AFTER the floor — strictly past the floor is genuinely under 40 business days", () => {
    expect(isRenewalNoticeMissed(floor, addCalendarDays(floor, 1))).toBe(true)
  })

  it("is NOT missed when the floor degraded to null past the horizon — the advisory alert is simply absent", () => {
    expect(isRenewalNoticeMissed(null, "2027-01-01")).toBe(false)
  })
})

describe("F-14/F-15 — one s14 date, and a sentinel that fires before the cron needs it", () => {
  it("the sentinel warns EARLIER than the cron's candidate band (the alert cannot arrive too late)", () => {
    // These were unrelated literals: the cron reached 120 days out, health warned at 90. So whenever the
    // holiday table's horizon sat in that 30-day gap, the cron met leases whose s14 date it could not compute,
    // skipped them with a console.warn, and health still said "ok". Derived now — the ordering is structural.
    expect(HOLIDAY_HORIZON_WARN_DAYS).toBeGreaterThan(CPA_RENEWAL_CANDIDATE_BAND_DAYS)
  })

  it("the notice-due target and the missed-notice floor are DIFFERENT dates, and the floor is later", () => {
    // The report used to decide "overdue" off the notice date itself. The target is when we NUDGE (60 bd);
    // the floor is when the lawful window CLOSES (40 bd). Judging "missed" off the target flags a lease as
    // overdue while ~20 lawful business days remain.
    const end = "2027-06-30"
    const due = cpaRenewalNoticeDueSafe(end)
    const floor = cpaRenewalNoticeFloorSafe(end)
    expect(due).toBeTruthy()
    expect(floor).toBeTruthy()
    expect(due! < floor!, "the 60-bd target falls BEFORE the 40-bd floor").toBe(true)

    // On the floor day itself the notice is still lawful — s14 says "not less than 40 business days".
    expect(isRenewalNoticeMissed(floor, floor!)).toBe(false)
    expect(isRenewalNoticeMissed(floor, "2027-06-29")).toBe(true)
  })
})
