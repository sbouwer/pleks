/**
 * lib/calendar/events.test.ts — the calendar reads inspections.scheduled_date as an instant, in SAST
 *
 * Notes:  ADDENDUM_63E B0. The write now stores a typed 10:00 as 08:00Z; the old read sliced the ISO
 *         string and would have shown 08:00. Both directions are pinned: a real instant shows SA wall-clock,
 *         and a date-only carrier (00:00Z, from lease activation or a reschedule-request resolution) stays
 *         all-day on the right day.
 */
import { describe, it, expect } from "vitest"
import { buildInspectionEvents } from "./events"
import { saWallClockToInstant } from "@/lib/dates"

const row = (scheduled_date: string) => ({ id: "i1", type: "move_in", scheduled_date, units: null })

describe("buildInspectionEvents — SA wall-clock, not the UTC slice", () => {
  it("typed 10:00 → stored 08:00Z → shown 10:00 on the same day", () => {
    const stored = saWallClockToInstant("2026-10-01T10:00").toISOString()   // what the write now stores
    const [e] = buildInspectionEvents([row(stored.replace("Z", "+00:00"))], "2026-09-30")
    expect(e.date).toBe("2026-10-01")
    expect(e.time).toBe("10:00")
    expect(e.allDay).toBe(false)
  })

  it("an early-morning SA time is on the SA day, not the previous UTC day", () => {
    const [e] = buildInspectionEvents([row("2026-09-30T23:30:00+00:00")], "2026-09-30")   // 01:30 SAST on the 1st
    expect(e.date).toBe("2026-10-01")
    expect(e.time).toBe("01:30")
  })

  it("a date-only carrier (00:00Z) is all-day on its own date", () => {
    const [e] = buildInspectionEvents([row("2026-10-01T00:00:00+00:00")], "2026-09-30")
    expect(e.date).toBe("2026-10-01")
    expect(e.allDay).toBe(true)
    expect(e.time).toBeUndefined()
  })

  it("an SA day before today is overdue", () => {
    const [e] = buildInspectionEvents([row("2026-09-29T08:00:00+00:00")], "2026-09-30")
    expect(e.eventType).toBe("inspection_overdue")
  })
})
