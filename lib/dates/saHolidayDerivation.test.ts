/**
 * lib/dates/saHolidayDerivation.test.ts — the gate that keeps the generator and the committed table honest
 *
 * ⚠ THE REGENERATE-AND-DIFF TEST IS THE ENFORCEMENT (ADDENDUM_70L A3). `saHolidays.json` and
 *   `saHolidayDerivation.ts` are two copies of the same facts, and nothing else would make them agree.
 *   `vitest run` is already in `npm run check`, so this file is what fails a hand-edit of the JSON.
 *
 *   The refusal tests are the other half, and they are the load-bearing ones: a derivation that silently
 *   emitted one fewer holiday in a collision year would pass every caretaker rule and every count-based
 *   check, and be wrong by one statutory day. Each is probed in BOTH directions — the collision year must
 *   refuse AND its neighbours must derive.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  COVERAGE_FROM_YEAR,
  HolidayDerivationError,
  deriveHolidayTable,
  deriveYear,
  firstUndeterminedYear,
  isDerivableYear,
  renderHolidayTableJson,
  scheduleOneForYear,
  type Proclamation,
} from "./saHolidayDerivation"
import { easterSundayISO, utcDayOfWeek } from "./saHolidayStatute"
import { HOLIDAY_TABLE_COVERS_THROUGH, SA_PUBLIC_HOLIDAYS } from "./saPublicHolidays"

const DATES_DIR = join(process.cwd(), "lib", "dates")
const readProclamations = () =>
  (JSON.parse(readFileSync(join(DATES_DIR, "saProclamations.json"), "utf8")) as { proclamations: Proclamation[] })
    .proclamations

describe("the committed table is the derivation's output", () => {
  it("regenerating reproduces saHolidays.json BYTE FOR BYTE", () => {
    const expected = renderHolidayTableJson(
      deriveHolidayTable({ fromYear: COVERAGE_FROM_YEAR, proclamations: readProclamations() }),
    )
    const committed = readFileSync(join(DATES_DIR, "saHolidays.json"), "utf8")

    // If this fails, the JSON was hand-edited or the derivation changed: run `npm run gen:holidays`.
    expect(committed).toBe(expected)
  })

  it("that diff has TEETH — a single changed row makes the render differ", () => {
    // The other direction, and not a tautology: without it, `committed === expected` above would pass
    // just as happily if the renderer emitted a constant, or if both sides were empty. This is the
    // 2026-08-17 scar — "a check that can pass without executing its subject is not a check".
    const table = deriveHolidayTable({ fromYear: COVERAGE_FROM_YEAR, proclamations: readProclamations() })
    const committed = readFileSync(join(DATES_DIR, "saHolidays.json"), "utf8")

    const tampered = {
      ...table,
      holidays: table.holidays.map((h, i) => (i === 0 ? { ...h, name: "Not A Real Holiday" } : h)),
    }
    expect(renderHolidayTableJson(tampered)).not.toBe(committed)

    // ...and a dropped row is caught too — the failure mode that matters is one holiday going MISSING.
    expect(renderHolidayTableJson({ ...table, holidays: table.holidays.slice(1) })).not.toBe(committed)
  })

  it("the caretaker accepts it — importing saPublicHolidays runs all six rules at module load", () => {
    // The import at the top of this file already threw if the generated table were invalid. Assert the
    // table is actually populated so a silently-empty import cannot pass this as a no-op.
    expect(SA_PUBLIC_HOLIDAYS.length).toBeGreaterThan(100)
    expect(HOLIDAY_TABLE_COVERS_THROUGH).toBe("2032-12-31")
  })

  it("carries the hand-entered s2A proclamation, with its Gazette source", () => {
    const s2a = SA_PUBLIC_HOLIDAYS.filter((h) => h.basis === "PHA s2A")
    expect(s2a).toHaveLength(1)
    expect(s2a[0].date).toBe("2026-11-04")
    expect(s2a[0].source).toContain("Gazette 55352")
  })
})

describe("the computus", () => {
  // Pinned against known-good published dates. This is the one derivation with no natural cross-check:
  // a wrong easter() mis-dates Good Friday and Family Day in EVERY year at once, consistently, so the
  // table would look internally coherent while being wrong twice a year forever.
  it.each([
    [2020, "2020-04-12", "2020-04-10"],
    [2021, "2021-04-04", "2021-04-02"],
    [2022, "2022-04-17", "2022-04-15"],
    [2023, "2023-04-09", "2023-04-07"],
    [2024, "2024-03-31", "2024-03-29"],
    [2025, "2025-04-20", "2025-04-18"],
    [2026, "2026-04-05", "2026-04-03"],
    [2027, "2027-03-28", "2027-03-26"],
    [2030, "2030-04-21", "2030-04-19"],
    [2033, "2033-04-17", "2033-04-15"],
  ])("%i: Easter %s, Good Friday %s", (year, easter, goodFriday) => {
    expect(easterSundayISO(year)).toBe(easter)
    const gf = scheduleOneForYear(year).find((h) => h.name === "Good Friday")
    expect(gf?.date).toBe(goodFriday)
  })

  it("Easter is always a Sunday, Good Friday always a Friday, Family Day always a Monday", () => {
    for (let year = 2000; year <= 2060; year++) {
      if (!isDerivableYear(year)) continue
      const entries = scheduleOneForYear(year)
      expect(utcDayOfWeek(easterSundayISO(year))).toBe(0)
      expect(utcDayOfWeek(entries.find((h) => h.name === "Good Friday")!.date)).toBe(5)
      expect(utcDayOfWeek(entries.find((h) => h.name === "Family Day")!.date)).toBe(1)
    }
  })
})

describe("collision class (a) — a Sunday holiday whose s2(1) Monday is already a holiday", () => {
  // Christmas on a Sunday: 26 December is Day of Goodwill in its own right, so s2(1) has no work to do
  // (D-7f) and the historical gap-filler was a SEPARATE s2A proclamation on the 27th — a presidential act.
  const CHRISTMAS_ON_SUNDAY = [2005, 2011, 2016, 2022, 2033, 2039, 2044, 2050]

  it.each(CHRISTMAS_ON_SUNDAY)("%i REFUSES rather than emitting a year one holiday short", (year) => {
    expect(utcDayOfWeek(`${year}-12-25`)).toBe(0)
    expect(() => deriveYear(year)).toThrow(HolidayDerivationError)
    expect(() => deriveYear(year)).toThrow(/D-7f/)
    expect(() => deriveYear(year)).toThrow(/Government Gazette/)
  })

  it("the OTHER direction — every year 2000–2060 that is not a collision derives cleanly", () => {
    const refused: number[] = []
    for (let year = 2000; year <= 2060; year++) if (!isDerivableYear(year)) refused.push(year)

    // 2008 is class (b), below. Any OTHER refusal means the derivation has become over-eager, which would
    // be just as broken as being silent — it would stop the table reaching years the statute does settle.
    expect(refused).toEqual([2008, ...CHRISTMAS_ON_SUNDAY].sort((a, b) => a - b))
  })
})

describe("collision class (b) — two Schedule-1 holidays on one calendar day", () => {
  it("2008 REFUSES: Good Friday fell on 21 March, which is Human Rights Day", () => {
    expect(easterSundayISO(2008)).toBe("2008-03-23")
    expect(() => scheduleOneForYear(2008)).toThrow(HolidayDerivationError)
    expect(() => scheduleOneForYear(2008)).toThrow(/both fall on 2008-03-21/)
  })

  it("the message does NOT tell the caller to remove a duplicate", () => {
    // The caretaker's Rule 1–3 would also catch this, but its wording ("appears twice. Remove the
    // duplicate.") misdirects a generator: there is no duplicate to remove, two statutory holidays
    // genuinely coincide. That misdirection is the only real gap ADDENDUM_70L A2(b) names.
    try {
      scheduleOneForYear(2008)
      expect.unreachable("2008 must refuse")
    } catch (err) {
      expect((err as Error).message).not.toMatch(/remove the duplicate/i)
      expect((err as Error).message).toMatch(/legal question, not a computation/)
    }
  })
})

describe("the horizon is DERIVED, not typed", () => {
  it("ends the year before the first year the statute does not settle", () => {
    expect(firstUndeterminedYear(COVERAGE_FROM_YEAR)).toBe(2033)

    const table = deriveHolidayTable({ fromYear: COVERAGE_FROM_YEAR, proclamations: readProclamations() })
    expect(table.coversFrom).toBe("2025-01-01")
    expect(table.coversThrough).toBe("2032-12-31")
  })

  it("refuses to report a horizon it only reached by hitting the scan limit", () => {
    // A silent "no collisions found" would make coversThrough an artefact of the scan bound rather than
    // of the statute — the exact class of wrongness this addendum exists to stop.
    expect(() => firstUndeterminedYear(2025, 2030)).toThrow(/scan limit was reached/)
  })
})

describe("every derived year satisfies the statute it came from", () => {
  it("carries all twelve Schedule-1 holidays, and shifts only Sundays", () => {
    for (let year = COVERAGE_FROM_YEAR; year <= 2032; year++) {
      const entries = deriveYear(year)
      expect(entries.filter((h) => h.basis === "PHA s1 Sch 1")).toHaveLength(12)

      for (const shift of entries.filter((h) => h.observedShiftOf !== null)) {
        expect(utcDayOfWeek(shift.observedShiftOf!)).toBe(0)
        expect(utcDayOfWeek(shift.date)).toBe(1)
        expect(entries.some((h) => h.date === shift.observedShiftOf)).toBe(true)
      }
    }
  })

  it("never shifts a SATURDAY holiday — s2(1) speaks of Sundays only", () => {
    for (let year = COVERAGE_FROM_YEAR; year <= 2032; year++) {
      const entries = deriveYear(year)
      for (const h of entries.filter((e) => utcDayOfWeek(e.date) === 6)) {
        expect(entries.some((e) => e.observedShiftOf === h.date)).toBe(false)
      }
    }
  })
})

describe("s2A proclamations — the half no algorithm may invent", () => {
  const base = { fromYear: COVERAGE_FROM_YEAR }
  const good: Proclamation = { date: "2026-11-04", name: "Local Government Elections", source: "Gazette 55352" }

  it("accepts a well-formed proclamation inside the window", () => {
    const table = deriveHolidayTable({ ...base, proclamations: [good] })
    const row = table.holidays.find((h) => h.date === "2026-11-04")
    expect(row).toMatchObject({ basis: "PHA s2A", observedShiftOf: null, source: "Gazette 55352" })
  })

  it("REFUSES one with no Gazette reference — a proclamation without one is a rumour", () => {
    expect(() => deriveHolidayTable({ ...base, proclamations: [{ ...good, source: "  " }] })).toThrow(/rumour/)
  })

  it("REFUSES one with no name — the last unguarded field of the hand-carried half", () => {
    // The JSON is external data, so the Proclamation type binds nothing at runtime. Unguarded, a null
    // name rendered into saHolidays.json and passed all six caretaker rules.
    expect(() => deriveHolidayTable({ ...base, proclamations: [{ ...good, name: "  " }] })).toThrow(/has no name/)
    expect(() =>
      deriveHolidayTable({ ...base, proclamations: [{ ...good, name: null as unknown as string }] }),
    ).toThrow(/has no name/)
  })

  it("REFUSES one that falls on a Sunday — whether s2(1) then applies is a reading, not a computation", () => {
    expect(utcDayOfWeek("2026-11-01")).toBe(0)
    expect(() =>
      deriveHolidayTable({ ...base, proclamations: [{ ...good, date: "2026-11-01" }] }),
    ).toThrow(/falls on a SUNDAY/)
  })

  it("REFUSES one that collides with a derived holiday", () => {
    expect(() =>
      deriveHolidayTable({ ...base, proclamations: [{ ...good, date: "2026-12-25" }] }),
    ).toThrow(/already "Christmas Day"/)
  })

  it("REFUSES one outside the derived window, and points at the year that ends it", () => {
    expect(() =>
      deriveHolidayTable({ ...base, proclamations: [{ ...good, date: "2035-06-01" }] }),
    ).toThrow(/2033 needs a Gazette reading/)
  })

  it("REFUSES a date that is not a real calendar day", () => {
    // V8 rolls 2026-02-30 over to 2 March rather than rejecting it — only a round-trip catches it.
    expect(() =>
      deriveHolidayTable({ ...base, proclamations: [{ ...good, date: "2026-02-30" }] }),
    ).toThrow(/not a real day/)
  })
})
