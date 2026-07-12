/**
 * lib/import/normalise.test.ts — import boundary parsers: locale-aware money, real-calendar-day dates
 *
 * Census #13: the money parser stripped commas blind, so an af-ZA export ("6600,50", decimal comma) became
 * R660,050.00 — a silent 100× error straight into rent, deposit and the trust ledger. These pin both SA
 * locale shapes, reject the ambiguous ones rather than guess, and pin the real-date boundary (V8-rollover
 * class: "2026-11-31" must be rejected at parse, not rolled to Dec 1 and bounced by Postgres later).
 */
import { describe, it, expect } from "vitest"
import {
  normaliseCurrencyCents, normaliseDate,
  isCentsDenominatedHeader, normaliseCentsValue, normaliseMoneyCents,
} from "./normalise"

describe("normaliseCurrencyCents — locale-aware, both SA shapes, reject-ambiguous", () => {
  it("af-ZA decimal comma is NOT a thousands separator (the census #13 regression)", () => {
    expect(normaliseCurrencyCents("6600,50")).toBe(660050)      // R6,600.50 — was 66005000 (R660,050) before
    expect(normaliseCurrencyCents("6 600,50")).toBe(660050)     // af-ZA: space thousands + comma decimal
    expect(normaliseCurrencyCents("1 234 567,89")).toBe(123456789)
  })

  it("en-ZA comma thousands + dot decimal", () => {
    expect(normaliseCurrencyCents("6,600.50")).toBe(660050)
    expect(normaliseCurrencyCents("R 6,600.00")).toBe(660000)
    expect(normaliseCurrencyCents("1,234,567.89")).toBe(123456789)
  })

  it("af-ZA dot thousands + comma decimal (the mirror layout)", () => {
    expect(normaliseCurrencyCents("6.600,50")).toBe(660050)
    expect(normaliseCurrencyCents("1.234.567,89")).toBe(123456789)
  })

  it("whole rands and thousands groupings with no decimal", () => {
    expect(normaliseCurrencyCents("5000")).toBe(500000)
    expect(normaliseCurrencyCents("6,600")).toBe(660000)        // thousands grouping (3 trailing digits)
    expect(normaliseCurrencyCents("R 12 500")).toBe(1250000)
  })

  it("single dot is the decimal point regardless of the digit count after it", () => {
    expect(normaliseCurrencyCents("6600.5")).toBe(660050)
    expect(normaliseCurrencyCents("6.60")).toBe(660)           // R6.60
  })

  it("handles negatives (GL credits) and the currency symbol", () => {
    expect(normaliseCurrencyCents("-500.00")).toBe(-50000)
    expect(normaliseCurrencyCents("R-1 250,00")).toBe(-125000)
  })

  it("returns null — never a guess — on genuinely ambiguous or unparseable input", () => {
    expect(normaliseCurrencyCents("6,6600")).toBeNull()        // one comma, 4 trailing digits — ambiguous
    expect(normaliseCurrencyCents("6,600,50")).toBeNull()      // comma used for both — ambiguous
    expect(normaliseCurrencyCents("1.234.567")).toBeNull()     // multiple dots, no comma — ambiguous grouping
    expect(normaliseCurrencyCents("")).toBeNull()
    expect(normaliseCurrencyCents("N/A")).toBeNull()
    expect(normaliseCurrencyCents("R")).toBeNull()
  })
})

describe("normaliseMoneyCents — the F-8 regression: a cents column must not be ×100'd again", () => {
  it("detects a cents-denominated HEADER (and does not false-positive on 'percents')", () => {
    expect(isCentsDenominatedHeader("rent_amount_cents")).toBe(true)
    expect(isCentsDenominatedHeader("monthly_rent_cents")).toBe(true)
    expect(isCentsDenominatedHeader("Deposit Amount Cents")).toBe(true)
    expect(isCentsDenominatedHeader("cents")).toBe(true)

    expect(isCentsDenominatedHeader("Monthly Rent")).toBe(false)
    expect(isCentsDenominatedHeader("rent")).toBe(false)
    expect(isCentsDenominatedHeader("percents")).toBe(false)   // no separator before "cents"
  })

  it("a Pleks re-export (monthly_rent_cents) keeps its value — NOT inflated 100×", () => {
    // R6,600.00 exported as 660000 cents. The old code parsed it as R660 000 and stored 66 000 000 cents.
    expect(normaliseMoneyCents("660000", "monthly_rent_cents")).toBe(660000)
    expect(normaliseMoneyCents("660000", "rent_amount_cents")).toBe(660000)
    expect(normaliseMoneyCents("125000", "deposit_amount_cents")).toBe(125000)
  })

  it("a normal agency export (rands) is still converted to cents", () => {
    expect(normaliseMoneyCents("6600", "Monthly Rent")).toBe(660000)
    expect(normaliseMoneyCents("6 600,50", "Monthly Rent")).toBe(660050)   // af-ZA still works through this door
    expect(normaliseMoneyCents("R 6,600.00", "Rent")).toBe(660000)
  })

  it("a FRACTIONAL value in a cents column is contradictory → null (flag, never round)", () => {
    expect(normaliseCentsValue("660000.50")).toBeNull()
    expect(normaliseMoneyCents("660000,50", "monthly_rent_cents")).toBeNull()
  })

  it("cents columns still take separators and negatives", () => {
    expect(normaliseCentsValue("660 000")).toBe(660000)
    expect(normaliseCentsValue("-50000")).toBe(-50000)
    expect(normaliseCentsValue("")).toBeNull()
    expect(normaliseCentsValue("N/A")).toBeNull()
  })
})

describe("normaliseDate — real calendar days only, fail-closed at the parse boundary", () => {
  it("accepts the three supported formats and normalises to YYYY-MM-DD", () => {
    expect(normaliseDate("2026-12-31")).toBe("2026-12-31")
    expect(normaliseDate("31/12/2026")).toBe("2026-12-31")
    expect(normaliseDate("31-12-2026")).toBe("2026-12-31")
    expect(normaliseDate("1/2/2026")).toBe("2026-02-01")       // zero-pads
  })

  it("rejects UNREAL dates at parse instead of rolling them over (V8-rollover / #12 class)", () => {
    expect(normaliseDate("2026-11-31")).toBeNull()             // Nov has 30 days — was returned as-is before
    expect(normaliseDate("31/11/2026")).toBeNull()
    expect(normaliseDate("2026-02-29")).toBeNull()             // 2026 is not a leap year
    expect(normaliseDate("2026-13-01")).toBeNull()             // month 13
    expect(normaliseDate("2026-00-10")).toBeNull()             // month 0
  })

  it("accepts a real leap day", () => {
    expect(normaliseDate("2024-02-29")).toBe("2024-02-29")
    expect(normaliseDate("29/02/2024")).toBe("2024-02-29")
  })

  it("returns null on empty or unrecognised shapes", () => {
    expect(normaliseDate("")).toBeNull()
    expect(normaliseDate("not a date")).toBeNull()
    expect(normaliseDate("2026/12/31")).toBeNull()             // slashes with YYYY first — not a supported shape
  })
})
