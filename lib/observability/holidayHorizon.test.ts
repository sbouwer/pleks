/**
 * lib/observability/holidayHorizon.test.ts — the sentinel that keeps the statutory throw unreachable
 *
 * Notes:  addBusinessDays THROWS past the SA public-holiday table's horizon rather than silently shortening
 *         a tenant's cure period. That throw is the BACKSTOP. This sentinel is the plan: it nags from 90
 *         days out, while there is still an ops calendar to act on. If it ever stops firing, the first
 *         symptom is a statutory computation erroring in production.
 */
import { describe, it, expect } from "vitest"
import { checkHolidayTable } from "./health"
import { HOLIDAY_TABLE_COVERS_THROUGH } from "@/lib/dates/saPublicHolidays"

const daysBefore = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00.000Z`).getTime() - n * 86_400_000)

describe("checkHolidayTable — horizon sentinel", () => {
  it("is ok while the horizon is more than 90 days away", () => {
    expect(checkHolidayTable(daysBefore(HOLIDAY_TABLE_COVERS_THROUGH, 120)).status).toBe("ok")
  })

  it("degrades from 90 days out, naming the boundary and prompting a Gazette check", () => {
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
