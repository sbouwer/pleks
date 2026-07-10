/**
 * lib/dates/saPublicHolidays.test.ts — the table is a compliance process; these tests are its audit.
 *
 * The Act invariants are asserted as PROPERTIES OVER THE TABLE, not as a list of expected dates. A fixture
 * list would have been hand-copied from the same source as the table and would have agreed with it — which
 * is exactly how "2027-03-22" went missing (Human Rights Day 2027 falls on a Sunday, so the Monday is a
 * public holiday) and how "2026-03-23"/"2027-05-03" got added (their base holidays fall on SATURDAYS, which
 * the Act does not shift). A property test disagrees with the table when the table is wrong.
 */
import { describe, it, expect } from "vitest"
import {
  SA_PUBLIC_HOLIDAYS_2025, SA_PUBLIC_HOLIDAYS_2026, SA_PUBLIC_HOLIDAYS_2027,
  isPublicHoliday, addBusinessDays, subtractBusinessDays,
  isWithinHolidayHorizon, assertHolidayCoverage,
  HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH,
} from "./saPublicHolidays"

const ALL = [...SA_PUBLIC_HOLIDAYS_2025, ...SA_PUBLIC_HOLIDAYS_2026, ...SA_PUBLIC_HOLIDAYS_2027]
const SET = new Set(ALL)

const dow = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getUTCDay()
const shift = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)

/** Base holidays that legitimately fall on a Monday in their own right (not an s2(1) observance). */
const MONDAY_CAPABLE_FIXED = ["01-01", "03-21", "04-27", "05-01", "06-16", "08-09", "09-24", "12-16", "12-25", "12-26"]

describe("Public Holidays Act 36 of 1994, s2(1) — Sunday shifts to Monday; SATURDAY does not", () => {
  it("every Sunday holiday has its following Monday in the table", () => {
    const missing = ALL.filter((d) => dow(d) === 0).filter((sun) => !SET.has(shift(sun, 1)))
    // 2027-03-21 (Human Rights Day) is a Sunday; 2027-03-22 was missing → cure period ran a day SHORT.
    expect(missing).toEqual([])
  })

  it("no Monday entry is an unlawful shift of a SATURDAY holiday", () => {
    const spurious = ALL.filter((d) => dow(d) === 1).filter((mon) => {
      if (SET.has(shift(mon, -1)) && dow(shift(mon, -1)) === 0) return false  // lawful s2(1) observance
      if (MONDAY_CAPABLE_FIXED.includes(mon.slice(5))) return false           // fixed date landing on a Monday
      if (SET.has(shift(mon, -3)) && dow(shift(mon, -3)) === 5) return false  // Family Day = Easter Monday
      return true
    })
    // "2026-03-23" and "2027-05-03" shifted Saturday holidays — the Act shifts only Sundays.
    expect(spurious).toEqual([])
  })

  it("a Saturday holiday is NOT accompanied by a Monday observance", () => {
    for (const sat of ALL.filter((d) => dow(d) === 6)) {
      const monday = shift(sat, 2)
      const lawful = SET.has(shift(monday, -1)) && dow(shift(monday, -1)) === 0
      if (!lawful && !MONDAY_CAPABLE_FIXED.includes(monday.slice(5))) {
        expect(SET.has(monday), `${sat} is a Saturday; ${monday} must not be an observance`).toBe(false)
      }
    }
  })
})

describe("addBusinessDays — STATUTORY: weekends AND public holidays", () => {
  it("excludes a public holiday inside the window (the Rule 1 fail-open)", () => {
    // 2026-03-16 + 20 business days. Weekends-only lands on 04-13; Human Rights Day (Sat 03-21, not
    // shifted) is not a business day anyway, but Good Friday 04-03 and Family Day 04-06 both are excluded.
    expect(addBusinessDays("2026-03-16", 20)).toBe("2026-04-15")
    // Weekends-only arithmetic would have said the 13th — two days early.
    expect(addBusinessDays("2026-03-16", 20) > "2026-04-13").toBe(true)
  })

  it("the regression the missing 2027-03-22 caused", () => {
    // Human Rights Day 2027 falls on a Sunday, so Monday the 22nd is a holiday and must be skipped.
    expect(isPublicHoliday("2027-03-22")).toBe(true)
    expect(addBusinessDays("2027-03-19", 1)).toBe("2027-03-23")  // Fri → skip Sat/Sun/Mon-obs → Tue
  })

  it("preserves the pre-existing weekend behaviour where no holiday intervenes", () => {
    expect(addBusinessDays("2026-05-01", 20)).toBe("2026-05-29")
    expect(addBusinessDays("2026-07-03", 1)).toBe("2026-07-06")  // Fri → Mon
  })

  it("rejects a fractional or negative count rather than truncating", () => {
    expect(() => addBusinessDays("2026-07-03", 2.5)).toThrow(/whole number/)
    expect(() => addBusinessDays("2026-07-03", -1)).toThrow(/whole number/)
  })
})

describe("the horizon — fail CLOSED on the statutory path", () => {
  it("throws past the table, naming the boundary and the file to extend", () => {
    expect(() => addBusinessDays("2028-01-03", 5)).toThrow(/outside the SA public-holiday table/)
    expect(() => addBusinessDays("2028-01-03", 5)).toThrow(/saPublicHolidays\.ts/)
    expect(() => addBusinessDays("2028-01-03", 5)).toThrow(new RegExp(HOLIDAY_TABLE_COVERS_THROUGH))
  })

  it("throws when the WALK crosses the horizon, not just the start date", () => {
    // Starts inside, ends outside — a silently weekends-only tail would be the exact bug we are preventing.
    expect(() => addBusinessDays("2027-12-20", 20)).toThrow(/outside the SA public-holiday table/)
  })

  it("throws below the table too — an unknown holiday is not an absent one", () => {
    expect(() => assertHolidayCoverage("2024-12-31", "test")).toThrow(/outside/)
    expect(isWithinHolidayHorizon(HOLIDAY_TABLE_COVERS_FROM)).toBe(true)
    expect(isWithinHolidayHorizon(HOLIDAY_TABLE_COVERS_THROUGH)).toBe(true)
  })
})

describe("subtractBusinessDays — ADVISORY: warns and degrades, never throws", () => {
  it("does not throw past the horizon (a lease ending in 2029 must not blank the calendar)", () => {
    expect(() => subtractBusinessDays(new Date("2029-06-30T00:00:00Z"), 20)).not.toThrow()
  })

  it("is UTC-anchored, so it cannot drift with the server timezone", () => {
    // Fri 2026-07-10 minus 1 business day → Thu 2026-07-09.
    expect(subtractBusinessDays(new Date("2026-07-10T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-07-09")
    // Mon 2026-07-06 minus 1 → Fri 2026-07-03 (skips the weekend).
    expect(subtractBusinessDays(new Date("2026-07-06T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-07-03")
  })
})
