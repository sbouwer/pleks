/**
 * lib/dates/index.test.ts — boundary battery for the date vocabulary
 *
 * Notes:  Every fixture probes a specific edge and says which side of it it sits on. The point is not
 *         coverage — it is that a future green run proves the SPEC still holds, so nobody "simplifies" a
 *         guard back into a silent Invalid Date, and nobody replaces saDateISO with a .slice(0,10).
 */
import { describe, it, expect } from "vitest"
import {
  SA_TIMEZONE, saDateISO, saTodayISO, isSameSaDay, isSaDateISO,
  calendarDate, addCalendarDays, addCalendarMonths, diffCalendarDays, saDayStartUtc,
  fmtDateZA, fmtDateLongZA, fmtDateTimeZA,
} from "./index"

// ── The 22:00 UTC day-flip: the SA day turns over two hours before the UTC day ────────────────────────

describe("saDateISO — the SA day flips at 22:00 UTC, not midnight", () => {
  it("resolves the instant in SAST, not UTC", () => {
    expect(saDateISO(new Date("2026-07-08T21:59:59Z"))).toBe("2026-07-08")  // 23:59:59 SAST, still the 8th
    expect(saDateISO(new Date("2026-07-08T22:00:00Z"))).toBe("2026-07-09")  // 00:00 SAST, already the 9th
    expect(saDateISO(new Date("2026-07-09T00:00:00Z"))).toBe("2026-07-09")  // past midnight UTC, agree again
  })

  it("is exactly the bug that .toISOString().slice(0,10) produces", () => {
    const at = new Date("2026-07-08T22:00:00Z")
    expect(at.toISOString().slice(0, 10)).toBe("2026-07-08")   // the wrong answer
    expect(saDateISO(at)).toBe("2026-07-09")                   // the right one
  })

  it("isSameSaDay follows the SA day — two seconds apart can be different days", () => {
    const before = new Date("2026-07-08T21:59:59Z")   // 23:59:59 SAST, the 8th
    const after  = new Date("2026-07-08T22:00:01Z")   // 00:00:01 SAST, the 9th
    expect(isSameSaDay(before, after)).toBe(false)
    expect(isSameSaDay(after, new Date("2026-07-09T06:00:00Z"))).toBe(true)  // 8 hours apart, same SA day
  })

  it("saTodayISO agrees with saDateISO(now)", () => {
    expect(saTodayISO()).toBe(saDateISO(new Date()))
  })
})

// ── The dependency we did NOT add: the fixed +02:00 offset must equal Intl, all year ──────────────────

describe("SAST has no DST — the fixed offset is not an assumption, it is asserted", () => {
  it("saDayStartUtc lands on 22:00 UTC of the previous day, in every month of the year", () => {
    for (let m = 1; m <= 12; m++) {
      const iso = `2026-${String(m).padStart(2, "0")}-15`
      const start = saDayStartUtc(iso)
      // 00:00 SAST == 22:00 UTC the day before, always. If SA ever adopted DST this fails loudly.
      expect(start.toISOString()).toBe(`2026-${String(m).padStart(2, "0")}-14T22:00:00.000Z`)
      // ...and Intl agrees the instant belongs to that SA day.
      expect(saDateISO(start)).toBe(iso)
    }
  })

  it("Intl reports a constant +02:00 offset for SAST across the year (the date-fns-tz we did not need)", () => {
    for (let m = 1; m <= 12; m++) {
      const probe = new Date(Date.UTC(2026, m - 1, 15, 12, 0, 0))
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: SA_TIMEZONE, timeZoneName: "longOffset" })
        .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value
      expect(parts).toBe("GMT+02:00")
    }
  })

  it("a day range uses an EXCLUSIVE next-day start — no inclusive 23:59:59 gap", () => {
    const lo = saDayStartUtc("2026-07-08")
    const hi = saDayStartUtc(addCalendarDays("2026-07-08", 1))
    const lastMillisecond = new Date(hi.getTime() - 1)     // 23:59:59.999 SAST, still the 8th
    expect(saDateISO(lastMillisecond)).toBe("2026-07-08")
    expect(lastMillisecond >= lo && lastMillisecond < hi).toBe(true)
  })
})

// ── Fail closed: never hand back an Invalid Date ──────────────────────────────────────────────────────

describe("fail closed — an Invalid Date compares false both ways and reads as 'no rows'", () => {
  it("rejects malformed calendar dates instead of yielding Invalid Date", () => {
    expect(() => calendarDate("2026-7-8")).toThrow(/YYYY-MM-DD/)      // unpadded
    expect(() => calendarDate("08-07-2026")).toThrow(/YYYY-MM-DD/)    // wrong order
    expect(() => calendarDate("")).toThrow(/YYYY-MM-DD/)
    expect(() => calendarDate("2026-13-01")).toThrow(/not a real date/)
    expect(() => calendarDate("2026-01-32")).toThrow(/not a real date/)
  })

  it("rejects an overflowing day rather than silently rolling it forward", () => {
    // THE trap: V8 does not return Invalid Date for a day that overflows its month. It rolls over.
    expect(new Date("2026-02-30T00:00:00Z").toISOString().slice(0, 10)).toBe("2026-03-02")
    expect(new Date("2025-02-29T00:00:00Z").toISOString().slice(0, 10)).toBe("2025-03-01")

    expect(() => calendarDate("2026-02-30")).toThrow(/not a real date/)
    expect(() => calendarDate("2025-02-29")).toThrow(/not a real date/)   // 2025 is not a leap year
    expect(() => calendarDate("2026-04-31")).toThrow(/not a real date/)   // April has 30
    expect(() => addCalendarDays("2025-02-29", 1)).toThrow(/not a real date/)

    expect(calendarDate("2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z")  // the real leap day
  })

  it("isSaDateISO is the guard for untrusted input", () => {
    expect(isSaDateISO("2026-07-08")).toBe(true)
    expect(isSaDateISO("2024-02-29")).toBe(true)     // real leap day
    expect(isSaDateISO("2025-02-29")).toBe(false)    // not a leap year
    expect(isSaDateISO("2026-7-8")).toBe(false)
    expect(isSaDateISO("garbage")).toBe(false)
    expect(isSaDateISO(undefined)).toBe(false)
    expect(isSaDateISO(20260708)).toBe(false)
  })

  it("saDateISO rejects a non-instant rather than formatting NaN", () => {
    expect(() => saDateISO(new Date("nonsense"))).toThrow(/not a real instant/)
  })
})

// ── Calendar arithmetic (operation 3 — no timezone involved) ──────────────────────────────────────────

describe("addCalendarDays / diffCalendarDays", () => {
  it("crosses months, leap days and years", () => {
    expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01")   // non-leap
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29")   // leap
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addCalendarDays("2026-07-08", 0)).toBe("2026-07-08")
  })

  it("rejects a fractional shift instead of truncating", () => {
    expect(() => addCalendarDays("2026-07-08", 2.5)).toThrow(/whole number/)
    expect(() => addCalendarDays("2026-07-08", NaN)).toThrow(/whole number/)
  })

  it("addCalendarMonths is UTC-anchored, and ROLLS OVER (documented, not clamped)", () => {
    expect(addCalendarMonths("2026-01-15", 12)).toBe("2027-01-15")
    expect(addCalendarMonths("2026-03-31", -1)).toBe("2026-03-03")   // Feb 31 rolls; matches setUTCMonth
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-03-03")    // NOT clamped to Feb 28 — see the doc
    expect(addCalendarMonths("2026-12-01", 1)).toBe("2027-01-01")
    expect(() => addCalendarMonths("2026-01-31", 1.5)).toThrow(/whole number/)
  })

  it("diffCalendarDays counts CALENDAR days, not 24-hour spans", () => {
    // 23:00 Mon -> 08:00 Tue is 9 hours: a ms-division floors to 0, the calendar says 1.
    const monEvening = new Date("2026-07-06T21:00:00Z")   // 23:00 SAST Mon
    const tueMorning = new Date("2026-07-07T06:00:00Z")   // 08:00 SAST Tue
    expect(Math.floor((tueMorning.getTime() - monEvening.getTime()) / 86_400_000)).toBe(0)
    expect(diffCalendarDays(monEvening, tueMorning)).toBe(1)

    expect(diffCalendarDays("2026-07-08", "2026-07-08")).toBe(0)
    expect(diffCalendarDays("2026-07-08", "2026-08-07")).toBe(30)
    expect(diffCalendarDays("2026-08-07", "2026-07-08")).toBe(-30)   // sign is from -> to
  })
})

// ── Display (operation 4 — always carries a timeZone) ─────────────────────────────────────────────────

describe("formatters render in SAST regardless of the server timezone", () => {
  it("a 22:30 UTC instant displays as the NEXT SA day", () => {
    const at = new Date("2026-07-08T22:30:00Z")   // 00:30 SAST on the 9th
    expect(fmtDateZA(at)).toContain("9")
    expect(fmtDateLongZA(at)).toContain("July")
    expect(fmtDateTimeZA(at)).toContain("00:30")
  })

  it("a date-only string renders as that day, not shifted by its UTC-midnight carrier", () => {
    expect(fmtDateZA("2026-07-08")).toContain("8")
    expect(fmtDateLongZA("2026-07-08")).toBe("8 July 2026")
  })

  it("throws on an unreal date rather than rendering 'Invalid Date'", () => {
    expect(() => fmtDateZA("2025-02-29")).toThrow(/not a real date/)
    expect(() => fmtDateZA(new Date("nonsense"))).toThrow(/not a real/)
  })
})
