/**
 * lib/dates/holidayAudit.test.ts — the auditor diffs, and the table wins a disagreement
 *
 * Pins the three diff classes, the window restriction (the API knowing 2030 is not a finding), and the
 * witness-disagreement escalation. Pure fixtures — no network.
 */
import { describe, it, expect } from "vitest"
import { classifyHolidayDiff, witnessDisagreement, type ApiHoliday } from "./holidayAudit"
import type { HolidayEntry } from "./saPublicHolidays"

const FROM = "2026-01-01"
const THROUGH = "2026-12-31"

const entry = (date: string, name: string, basis = "PHA s1 Sch 1"): HolidayEntry => ({ date, name, basis, observedShiftOf: null, source: null })

const TABLE: HolidayEntry[] = [
  entry("2026-01-01", "New Year's Day"),
  entry("2026-08-09", "National Women's Day"),
  entry("2026-08-10", "National Women's Day (obs)", "PHA s2(1)"),
  entry("2026-12-25", "Christmas Day"),
]

describe("classifyHolidayDiff", () => {
  it("Class A — API has a date the table lacks (a possible proclamation)", () => {
    const api: ApiHoliday[] = [...TABLE.map((h) => ({ date: h.date, name: h.name })), { date: "2026-05-29", name: "Election Day" }]
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.hasAlerts).toBe(true)
    expect(r.diffs.filter((d) => d.cls === "A").map((d) => d.date)).toEqual(["2026-05-29"])
  })

  it("Class B — table has a date the API lacks; the table wins pending review", () => {
    // A feed that missed the observed Monday — exactly the case the doctrine exists for.
    const api: ApiHoliday[] = TABLE.filter((h) => h.date !== "2026-08-10").map((h) => ({ date: h.date, name: h.name }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.hasAlerts).toBe(true)
    const b = r.diffs.filter((d) => d.cls === "B")
    expect(b.map((d) => d.date)).toEqual(["2026-08-10"])
    expect(b[0].detail).toMatch(/table wins/)
  })

  it("Class C — dates agree, name differs; informational, no alert", () => {
    const api: ApiHoliday[] = TABLE.map((h) => ({ date: h.date, name: h.date === "2026-12-25" ? "Christmas" : h.name }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    // "Christmas" vs "Christmas Day" normalises equal (substring of letters) — so NOT even a C. Prove a real C:
    const api2: ApiHoliday[] = TABLE.map((h) => ({ date: h.date, name: h.date === "2026-12-25" ? "Festive Holiday" : h.name }))
    const r2 = classifyHolidayDiff(TABLE, api2, FROM, THROUGH)
    expect(r.hasAlerts).toBe(false)
    expect(r2.diffs.filter((d) => d.cls === "C").map((d) => d.date)).toEqual(["2026-12-25"])
    expect(r2.hasAlerts).toBe(false)   // a name mismatch never alerts
  })

  it("the (obs) suffix is not a finding — name normalisation ignores parentheticals", () => {
    const api: ApiHoliday[] = TABLE.map((h) => ({ date: h.date, name: h.name.replace(" (obs)", "") }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.diffs).toEqual([])
  })

  it("does NOT flag a weekend holiday the feed omits — feeds list only the observed Monday", () => {
    // The real-world case: the table carries the Sunday holiday AND its observed Monday; Nager lists only the
    // Monday. 2026-08-09 (Sun) is in the table but not the feed — a weekend date, so it must NOT be Class-B.
    const api: ApiHoliday[] = TABLE.filter((h) => h.date !== "2026-08-09").map((h) => ({ date: h.date, name: h.name }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.diffs).toEqual([])           // the missing Sunday is immaterial to business-day arithmetic
    expect(r.hasAlerts).toBe(false)
  })

  it("ignores API dates OUTSIDE the coverage window (knowing 2030 is not a finding)", () => {
    const api: ApiHoliday[] = [...TABLE.map((h) => ({ date: h.date, name: h.name })), { date: "2030-01-01", name: "New Year's Day" }]
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.diffs).toEqual([])
  })
})

describe("witnessDisagreement — two feeds differing is itself a reason to look", () => {
  it("returns the dates the two witnesses disagree on, within the window", () => {
    const nager: ApiHoliday[] = [{ date: "2026-01-01", name: "NY" }, { date: "2026-08-10", name: "obs" }]
    const calendarific: ApiHoliday[] = [{ date: "2026-01-01", name: "NY" }, { date: "2026-05-29", name: "Election" }]
    expect(witnessDisagreement(nager, calendarific, FROM, THROUGH)).toEqual(["2026-05-29", "2026-08-10"])
  })

  it("is empty when the witnesses agree", () => {
    const a: ApiHoliday[] = [{ date: "2026-01-01", name: "x" }]
    expect(witnessDisagreement(a, a, FROM, THROUGH)).toEqual([])
  })
})
