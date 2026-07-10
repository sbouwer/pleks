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
  HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH, SA_PUBLIC_HOLIDAY_DATES, addBusinessDays, assertHolidayCoverage, isPublicHoliday, isWithinHolidayHorizon, subtractBusinessDays, subtractBusinessDaysStrict, validateHolidayTable,
} from "./saPublicHolidays"
import type { HolidayTable, HolidayEntry } from "./saPublicHolidays"

const ALL = [...SA_PUBLIC_HOLIDAY_DATES]
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
    // The error must name the file a human has to edit. That file moved to the JSON in 70K Phase A; the
    // PROPERTY being asserted — an error that states its own fix — is unchanged, which is the whole point.
    expect(() => addBusinessDays("2028-01-03", 5)).toThrow(/saHolidays\.json/)
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
    expect(() => subtractBusinessDays("2029-06-30", 20)).not.toThrow()
  })

  it("is UTC-anchored, so it cannot drift with the server timezone", () => {
    // Fri 2026-07-10 minus 1 business day → Thu 2026-07-09.
    expect(subtractBusinessDays("2026-07-10", 1)).toBe("2026-07-09")
    // Mon 2026-07-06 minus 1 → Fri 2026-07-03 (skips the weekend).
    expect(subtractBusinessDays("2026-07-06", 1)).toBe("2026-07-03")
  })
})

describe("subtractBusinessDaysStrict — STATUTORY backward walker (D-7g)", () => {
  it("computes the CPA s14 window off the live non-compliant lease (c7b4a009, end 2027-06-29)", () => {
    // The whole reason this walker exists: the stored 2027-05-20 is 40 CALENDAR days = 27 business days,
    // short of the statutory floor. These are the lawful business-day answers.
    expect(subtractBusinessDaysStrict("2027-06-29", 40)).toBe("2027-05-03")  // floor
    expect(subtractBusinessDaysStrict("2027-06-29", 60)).toBe("2027-04-02")  // mid-window (the target)
    expect(subtractBusinessDaysStrict("2027-06-29", 80)).toBe("2027-03-02")  // ceiling
  })

  it("is holiday-aware backwards — it skips OBSERVED Mondays, not just weekends", () => {
    // Each start is the Tuesday after an s2(1) observed Monday; minus 1 bd must clear the Monday + weekend.
    expect(subtractBusinessDaysStrict("2026-04-07", 1)).toBe("2026-04-02")  // clears Family Day Mon 04-06 + GF 04-03
    expect(subtractBusinessDaysStrict("2026-08-11", 1)).toBe("2026-08-07")  // clears obs Women's Day Mon 08-10
    expect(subtractBusinessDaysStrict("2027-03-23", 1)).toBe("2027-03-19")  // clears obs Human Rights Mon 03-22
    expect(subtractBusinessDaysStrict("2026-07-08", 0)).toBe("2026-07-08")  // zero is a no-op
  })

  it("throws at BOTH horizon ends — reaching for the advisory walker on a statutory path is the fail-open", () => {
    expect(() => subtractBusinessDaysStrict("2028-01-05", 1)).toThrow(/outside the SA public-holiday table/)  // start past
    expect(() => subtractBusinessDaysStrict("2024-12-31", 1)).toThrow(/outside/)                              // start below
    expect(() => subtractBusinessDaysStrict("2025-01-02", 5)).toThrow(/outside/)                              // WALK crosses below
  })

  it("matches TZ-invariantly (the whole point of UTC anchoring)", () => {
    // Computed under the runner's TZ; the value must not move. The TZ matrix in CI proves the rest.
    expect(subtractBusinessDaysStrict("2027-06-29", 60)).toBe("2027-04-02")
  })
})

describe("validateHolidayTable — the caretaker throws at boot on a malformed table (ADDENDUM_70K)", () => {
  // A minimal but VALID base table. Each fixture mutates one thing, so a throw pins one rule. 2026 is fully
  // covered (all twelve Schedule-1 holidays + the observed Women's-Day Monday); the window is trimmed to it.
  const VALID: HolidayTable = {
    coversFrom: "2026-01-01",
    coversThrough: "2026-12-31",
    holidays: [
      { date: "2026-01-01", name: "New Year's Day",             basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-03-21", name: "Human Rights Day",           basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-04-03", name: "Good Friday",                basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-04-06", name: "Family Day",                 basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-04-27", name: "Freedom Day",                basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-05-01", name: "Workers' Day",               basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-06-16", name: "Youth Day",                  basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-08-09", name: "National Women's Day",       basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-08-10", name: "National Women's Day (obs)", basis: "PHA s2(1)",    observedShiftOf: "2026-08-09", source: null },
      { date: "2026-09-24", name: "Heritage Day",               basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-12-16", name: "Day of Reconciliation",      basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-12-25", name: "Christmas Day",              basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2026-12-26", name: "Day of Goodwill",            basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
    ],
  }
  const clone = (): HolidayTable => structuredClone(VALID)
  const withHolidays = (mut: (h: HolidayEntry[]) => HolidayEntry[]): HolidayTable => {
    const t = clone(); t.holidays = mut(t.holidays); return t
  }

  it("the base fixture is valid (guards against a fixture that passes for the wrong reason)", () => {
    expect(() => validateHolidayTable(VALID)).not.toThrow()
  })

  it("rejects an unreal date rather than letting V8 roll it over", () => {
    expect(() => validateHolidayTable(withHolidays((h) => {
      h[1] = { ...h[1], date: "2026-02-30" }; return h   // Feb 30 → 2 March if not caught
    }))).toThrow(/not a real/)
  })

  it("rejects a duplicate and an out-of-order entry", () => {
    expect(() => validateHolidayTable(withHolidays((h) => [...h, { ...h[0] }]))).toThrow(/order|twice/)
    expect(() => validateHolidayTable(withHolidays((h) => [h[1], h[0], ...h.slice(2)]))).toThrow(/out of order/)
  })

  it("rejects an entry outside the coverage window", () => {
    expect(() => validateHolidayTable(withHolidays((h) =>
      [...h, { date: "2027-01-01", name: "next year", basis: "PHA s1 Sch 1", observedShiftOf: null, source: null }],
    ))).toThrow(/outside the coverage window/)
  })

  it("rejects an entry with no basis", () => {
    expect(() => validateHolidayTable(withHolidays((h) => { h[0] = { ...h[0], basis: "  " }; return h })))
      .toThrow(/no 'basis'/)
  })

  it("rejects a MISSING Sunday shift (this is the 2027-03-22 bug that shipped)", () => {
    // Human Rights Day 2026 is a Saturday, so 2026 has no natural Sunday shift to drop. Build the case on
    // 2027-03-21 (a real Sunday) in a one-year window instead.
    const t: HolidayTable = {
      coversFrom: "2027-01-01", coversThrough: "2027-12-31",
      holidays: [
        { date: "2027-03-21", name: "Human Rights Day", basis: "PHA s1 Sch 1", observedShiftOf: null, source: null },
      ],
    }
    expect(() => validateHolidayTable(t)).toThrow(/falls on a Sunday[\s\S]*is missing/)
  })

  it("rejects a shift of a non-Sunday — the Act shifts Sundays only", () => {
    // A well-formed-LOOKING shift: dated one day after its referent (so the preceding-day check passes),
    // but the referent 2026-06-29 is a MONDAY, not a Sunday. Only the day-of-week rule catches it. (A
    // Monday-observance-of-a-Saturday is unconstructible — Sat+1 is a Sunday — so the referent is a weekday.)
    expect(() => validateHolidayTable(withHolidays((h) =>
      [...h, { date: "2026-06-30", name: "spurious", basis: "PHA s2(1)", observedShiftOf: "2026-06-29", source: null }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    ))).toThrow(/not a Sunday/)
  })

  it("rejects an s2A proclamation with no Gazette source", () => {
    expect(() => validateHolidayTable(withHolidays((h) =>
      [...h, { date: "2026-06-29", name: "proc", basis: "PHA s2A", observedShiftOf: null, source: null }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    ))).toThrow(/must cite its Government Gazette/)
  })

  it("rejects a year that is missing a Schedule-1 holiday even if the count looks fine", () => {
    // Swap Christmas for a bogus extra day: count stays 13, but 12-25 is gone.
    expect(() => validateHolidayTable(withHolidays((h) => h.map((x) =>
      x.date === "2026-12-25" ? { ...x, date: "2026-11-30", name: "bogus", basis: "PHA s1 Sch 1" } : x,
    ).sort((a, b) => a.date.localeCompare(b.date))))).toThrow(/2026-12-25 is missing/)
  })

  // ── D-7f: the collision carve-out, in a fully-covered 2022 window ──────────────────────────────────
  // 2022-12-25 is a Sunday and 2022-12-26 (Day of Goodwill) is a Schedule-1 holiday in its own right, so
  // s2(1) has no work to do and the gap was filled by an s2A proclamation on the 27th.
  const YEAR_2022: HolidayTable = {
    coversFrom: "2022-01-01", coversThrough: "2022-12-31",
    holidays: [
      { date: "2022-01-01", name: "New Year's Day",        basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-03-21", name: "Human Rights Day",      basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-04-15", name: "Good Friday",           basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-04-18", name: "Family Day",            basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-04-27", name: "Freedom Day",           basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-05-01", name: "Workers' Day",          basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-05-02", name: "Workers' Day (obs)",    basis: "PHA s2(1)",    observedShiftOf: "2022-05-01", source: null },
      { date: "2022-06-16", name: "Youth Day",             basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-08-09", name: "National Women's Day",  basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-09-24", name: "Heritage Day",          basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-12-16", name: "Day of Reconciliation", basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-12-25", name: "Christmas Day",         basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-12-26", name: "Day of Goodwill",       basis: "PHA s1 Sch 1", observedShiftOf: null,         source: null },
      { date: "2022-12-27", name: "Public holiday (proc)", basis: "PHA s2A",      observedShiftOf: null,         source: "GG 45832, Proc R.63 of 2022" },
    ],
  }

  it("D-7f: the 2022 Christmas-on-Sunday collision boots CLEAN (no fabricated shift)", () => {
    expect(() => validateHolidayTable(YEAR_2022)).not.toThrow()
  })

  it("D-7f mirror: a FABRICATED shift onto Day of Goodwill throws", () => {
    // The bug the carve-out exists to catch: dress 26 Dec up as an s2(1) shift of 25 Dec. It satisfies every
    // other rule — 25 Dec is a real Sunday, one day earlier, present — so only the Schedule-1 check kills it.
    const bad = structuredClone(YEAR_2022)
    bad.holidays = bad.holidays.map((h) =>
      h.date === "2022-12-26"
        ? { ...h, name: "Day of Goodwill (obs)", basis: "PHA s2(1)", observedShiftOf: "2022-12-25" }
        : h,
    )
    expect(() => validateHolidayTable(bad)).toThrow(/Schedule-1 public holiday in its own right/)
  })
})
