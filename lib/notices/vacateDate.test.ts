/**
 * lib/notices/vacateDate.test.ts — R-2 service-date arithmetic
 */
import { describe, it, expect } from "vitest"
import { computeVacateByDate, deemedServiceMeetsFloor } from "./vacateDate"
import { saDateISO } from "@/lib/dates"
import { renderServiceNotificationSms, SERVICE_NOTIFICATION_VERSION } from "./serviceNotification"

describe("saDateISO (resolve an instant to its SA calendar date, never UTC)", () => {
  it("returns the SA date even when UTC is still the previous day (the late-night skew the notice must not print)", () => {
    // 2026-07-06T22:30:00Z = 2026-07-07 00:30 SAST → SA date is the 7th
    expect(saDateISO(new Date("2026-07-06T22:30:00Z"))).toBe("2026-07-07")
    // the bug it fixes: raw toISOString would print the 6th — a cancellation date pre-dating its own service
    // eslint-disable-next-line pleks/no-adhoc-dates -- deliberately demonstrates the UTC bug this module fixes
    expect(new Date("2026-07-06T22:30:00Z").toISOString().slice(0, 10)).toBe("2026-07-06")
  })
  it("matches the UTC date outside the 00:00–02:00 SAST skew window", () => {
    expect(saDateISO(new Date("2026-07-06T09:00:00Z"))).toBe("2026-07-06")
  })
})

describe("computeVacateByDate (R-2 default 14 calendar days)", () => {
  it("adds 14 days, crossing a month boundary", () => {
    expect(computeVacateByDate(new Date("2026-06-25T10:00:00Z"))).toBe("2026-07-09")
  })
  it("honours a custom day count (the 7-day floor)", () => {
    expect(computeVacateByDate(new Date("2026-01-01T00:00:00Z"), 7)).toBe("2026-01-08")
  })
})

describe("deemedServiceMeetsFloor (≥7 calendar days)", () => {
  it("true when the gap is ≥7 days (incl. exactly 7)", () => {
    expect(deemedServiceMeetsFloor("2026-07-20", new Date("2026-07-08T06:00:00Z"))).toBe(true)
    // Exactly 7 — deliberately OUTSIDE the 22:00–24:00 UTC skew window, so UTC and SAST agree on the day.
    expect(deemedServiceMeetsFloor("2026-07-08", new Date("2026-07-01T09:00:00Z"))).toBe(true)
  })
  it("false when the gap is under 7 days", () => {
    expect(deemedServiceMeetsFloor("2026-07-06", new Date("2026-07-01T00:00:00Z"))).toBe(false) // 5
  })

  // The deemed-service anchor is an INSTANT, not a date. Resolving it in UTC recorded service a day early,
  // inflating the gap and PASSING a short notice — a fail-open on the very check meant to catch it. SAST is
  // UTC+2, so anything delivered from 22:00 UTC belongs to the next SA day.
  it("resolves the deemed-service INSTANT in SAST, not UTC (regression — this case used to pass wrongly)", () => {
    // 2026-07-01T23:59Z = 2026-07-02 01:59 SAST. Gap to the 8th is therefore 6 days, not 7 → short.
    expect(deemedServiceMeetsFloor("2026-07-08", new Date("2026-07-01T23:59:00Z"))).toBe(false)
    // Proof of the old arithmetic: slicing the instant in UTC yields the 1st, which would read as 7 days.
    // eslint-disable-next-line pleks/no-adhoc-dates -- deliberately demonstrates the UTC bug this module fixes
    expect(new Date("2026-07-01T23:59:00Z").toISOString().slice(0, 10)).toBe("2026-07-01")
    expect(saDateISO(new Date("2026-07-01T23:59:00Z"))).toBe("2026-07-02")
  })

  it("is unchanged outside the skew window (a midday delivery resolves identically either way)", () => {
    expect(deemedServiceMeetsFloor("2026-07-09", new Date("2026-07-02T12:00:00Z"))).toBe(true)  // 7 days
    expect(deemedServiceMeetsFloor("2026-07-08", new Date("2026-07-02T12:00:00Z"))).toBe(false) // 6 days
  })
})

describe("service-notification micro-template (R-4)", () => {
  it("is a short pointer naming no statutory consequence; says 'sent' (accurate at dispatch), and is versioned", () => {
    const body = renderServiceNotificationSms()
    expect(body).toContain("legal notice regarding your tenancy has been sent")
    expect(body).not.toContain("delivered")   // written at dispatch, before any delivery confirmation
    expect(body).not.toMatch(/evict|PIE|cancel/i)
    expect(SERVICE_NOTIFICATION_VERSION).toBe(2)
  })
})
