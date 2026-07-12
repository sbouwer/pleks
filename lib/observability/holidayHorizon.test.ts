/**
 * lib/observability/holidayHorizon.test.ts — the sentinel that keeps the statutory throw unreachable
 *
 * Notes:  addBusinessDays THROWS past the SA public-holiday table's horizon rather than silently shortening
 *         a tenant's cure period. That throw is the BACKSTOP. This sentinel is the plan: it nags while there
 *         is still an ops calendar to act on. If it ever stops firing, the first symptom is a statutory
 *         computation erroring in production.
 *
 *         The threshold is DERIVED from the renewal cron's candidate band, not chosen. It used to be a bare
 *         90 against a cron that reaches 120 days out — so whenever the horizon sat in the 90-to-120-day band,
 *         the cron met leases whose s14 notice date it could not compute, skipped them with a console.warn,
 *         and this check still said "ok". The alert arrived AFTER the thing it exists to pre-empt. These tests
 *         now assert the ordering itself, so the two numbers can never drift back apart.
 */
import { describe, it, expect } from "vitest"
import { checkHolidayTable } from "./health"
import { HOLIDAY_TABLE_COVERS_THROUGH } from "@/lib/dates/saPublicHolidays"
import { HOLIDAY_HORIZON_WARN_DAYS, CPA_RENEWAL_CANDIDATE_BAND_DAYS } from "@/lib/leases/cpaRenewal"

const daysBefore = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00.000Z`).getTime() - n * 86_400_000)

describe("checkHolidayTable — horizon sentinel", () => {
  it("WARNS BEFORE the renewal cron can reach a lease it cannot compute", () => {
    // The invariant, stated directly. The cron bands candidates to CPA_RENEWAL_CANDIDATE_BAND_DAYS ahead; a
    // banded lease whose end date is past the table has NO computable s14 notice date and is silently skipped.
    // So the sentinel must fire strictly earlier than the band, with runway to actually extend the table.
    expect(HOLIDAY_HORIZON_WARN_DAYS).toBeGreaterThan(CPA_RENEWAL_CANDIDATE_BAND_DAYS)

    // At exactly the cron's reach, the sentinel is ALREADY degraded — it got there first.
    expect(checkHolidayTable(daysBefore(HOLIDAY_TABLE_COVERS_THROUGH, CPA_RENEWAL_CANDIDATE_BAND_DAYS)).status)
      .toBe("degraded")
  })

  it("is ok while the horizon is beyond the warning threshold", () => {
    expect(checkHolidayTable(daysBefore(HOLIDAY_TABLE_COVERS_THROUGH, HOLIDAY_HORIZON_WARN_DAYS + 30)).status).toBe("ok")
  })

  it("degrades inside the warning window, naming the boundary and prompting a Gazette check", () => {
    const r = checkHolidayTable(daysBefore(HOLIDAY_TABLE_COVERS_THROUGH, 30))
    expect(r.status).toBe("degraded")
    expect(r.error).toContain(HOLIDAY_TABLE_COVERS_THROUGH)
    // The nag is BOTH jobs: extend the table AND look for newly proclaimed once-off holidays.
    expect(r.error).toMatch(/Gazette/)
  })

  it("goes down once the table has expired — statutory computations are throwing by then", () => {
    // The final covered day is still covered, so not "down" — but it is deep inside the warn window.
    expect(checkHolidayTable(new Date(`${HOLIDAY_TABLE_COVERS_THROUGH}T00:00:00.000Z`)).status).toBe("degraded")

    const past = new Date(new Date(`${HOLIDAY_TABLE_COVERS_THROUGH}T00:00:00.000Z`).getTime() + 86_400_000)
    expect(checkHolidayTable(past).status).toBe("down")
  })

  it("resolves 'today' in SAST, not UTC — the sentinel must not flip a day early at 22:00 UTC", () => {
    // 22:00Z on the horizon's last day is already the NEXT SA day, i.e. expired.
    const lastDayLateUtc = new Date(`${HOLIDAY_TABLE_COVERS_THROUGH}T22:00:00.000Z`)
    expect(checkHolidayTable(lastDayLateUtc).status).toBe("down")
  })
})
