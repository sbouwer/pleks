/**
 * lib/notices/vacateDate.test.ts — R-2 service-date arithmetic
 */
import { describe, it, expect } from "vitest"
import { computeVacateByDate, deemedServiceMeetsFloor } from "./vacateDate"
import { renderServiceNotificationSms, SERVICE_NOTIFICATION_VERSION } from "./serviceNotification"

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
    expect(deemedServiceMeetsFloor("2026-07-08", new Date("2026-07-01T23:59:00Z"))).toBe(true) // exactly 7
  })
  it("false when the gap is under 7 days", () => {
    expect(deemedServiceMeetsFloor("2026-07-06", new Date("2026-07-01T00:00:00Z"))).toBe(false) // 5
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
