/**
 * lib/searchworx/utils.test.ts — Unit tests for Searchworx parsing helpers
 *
 * Notes:  ADDENDUM_14H v3 §O. Covers all 5 date patterns, both monetary formats,
 *         gender normalisation, phone normalisation, and request date formatting.
 */
import { describe, expect, it } from "vitest"
import {
  coerceNumericMap,
  formatSearchworxDateForRequest,
  normaliseGender,
  normaliseSearchworxPhone,
  parseIntOrZero,
  parseSearchworxCentsZeroPadded,
  parseSearchworxDate,
  parseSearchworxRandDecimal,
} from "./utils"

// ─── parseSearchworxDate — all 5 patterns ─────────────────────────────────────

describe("parseSearchworxDate", () => {
  it("returns null for empty / null / dash input", () => {
    expect(parseSearchworxDate(null)).toBeNull()
    expect(parseSearchworxDate(undefined)).toBeNull()
    expect(parseSearchworxDate("")).toBeNull()
    expect(parseSearchworxDate("-")).toBeNull()
    expect(parseSearchworxDate("   ")).toBeNull()
  })

  it("pattern 1 — dd/MM/yyyy HH:mm:ss (ReportDate)", () => {
    const d = parseSearchworxDate("18/05/2026 08:42:19")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2026-05-18T08:42:19.000Z")
  })

  it("pattern 1 — dd/MM/yyyy without time (DOB)", () => {
    const d = parseSearchworxDate("10/02/1960")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("1960-02-10T00:00:00.000Z")
  })

  it("pattern 2 — dd-MM-yyyy HH:mm (Experian Sigma EnquiryDate)", () => {
    const d = parseSearchworxDate("12-05-2026 10:21")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2026-05-12T10:21:00.000Z")
  })

  it("pattern 2 — dd-MM-yyyy without time", () => {
    const d = parseSearchworxDate("10-02-1960")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("1960-02-10T00:00:00.000Z")
  })

  it("pattern 3 — yyyy/MM/dd (CIPC registration)", () => {
    const d = parseSearchworxDate("2018/11/17")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2018-11-17T00:00:00.000Z")
  })

  it("pattern 4 — yyyy-MM-dd (XDS LastUpdatedDate, VeriCred IDIssuedDate)", () => {
    const d = parseSearchworxDate("2018-11-17")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2018-11-17T00:00:00.000Z")
  })

  it("pattern 4 — yyyy-MM-dd edge: recent date", () => {
    const d = parseSearchworxDate("2025-02-27")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2025-02-27T00:00:00.000Z")
  })

  it("pattern 5 — yyyyMMdd (TU InformationDate)", () => {
    const d = parseSearchworxDate("20260321")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2026-03-21T00:00:00.000Z")
  })

  it("pattern 5 — yyyyMMdd year-only bond: YYYY0000 clamps to Jan 1", () => {
    const d = parseSearchworxDate("20230000")
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2023)
    expect(d!.getUTCMonth()).toBe(0) // Jan
    expect(d!.getUTCDate()).toBe(1)
  })

  it("returns null for unrecognised format", () => {
    expect(parseSearchworxDate("not-a-date")).toBeNull()
    expect(parseSearchworxDate("2026/5/18")).toBeNull() // single-digit month
  })
})

// ─── parseSearchworxCentsZeroPadded ───────────────────────────────────────────

describe("parseSearchworxCentsZeroPadded", () => {
  it("parses zero-padded 9-digit cents", () => {
    expect(parseSearchworxCentsZeroPadded("000000700")).toBe(700)
    expect(parseSearchworxCentsZeroPadded("000017000")).toBe(17000)
    expect(parseSearchworxCentsZeroPadded("000000000")).toBe(0)
    expect(parseSearchworxCentsZeroPadded("012345678")).toBe(12345678)
  })

  it("handles null / undefined / empty → 0", () => {
    expect(parseSearchworxCentsZeroPadded(null)).toBe(0)
    expect(parseSearchworxCentsZeroPadded(undefined)).toBe(0)
    expect(parseSearchworxCentsZeroPadded("")).toBe(0)
  })

  it("handles non-padded numeric strings", () => {
    expect(parseSearchworxCentsZeroPadded("700")).toBe(700)
  })
})

// ─── parseSearchworxRandDecimal ───────────────────────────────────────────────

describe("parseSearchworxRandDecimal", () => {
  it("converts decimal Rand string to integer cents", () => {
    expect(parseSearchworxRandDecimal("0.0000")).toBe(0)
    expect(parseSearchworxRandDecimal("1550")).toBe(155000)
    expect(parseSearchworxRandDecimal("170.00")).toBe(17000)
    expect(parseSearchworxRandDecimal("2000")).toBe(200000)
    expect(parseSearchworxRandDecimal("0.5")).toBe(50)
  })

  it("handles null / undefined / empty → 0", () => {
    expect(parseSearchworxRandDecimal(null)).toBe(0)
    expect(parseSearchworxRandDecimal(undefined)).toBe(0)
    expect(parseSearchworxRandDecimal("")).toBe(0)
  })

  it("handles non-numeric → 0", () => {
    expect(parseSearchworxRandDecimal("N/A")).toBe(0)
  })
})

// ─── normaliseGender ──────────────────────────────────────────────────────────

describe("normaliseGender", () => {
  it("recognises male variants", () => {
    expect(normaliseGender("M")).toBe("male")
    expect(normaliseGender("Male")).toBe("male")
    expect(normaliseGender("MALE")).toBe("male")
    expect(normaliseGender("m")).toBe("male")
  })

  it("recognises female variants", () => {
    expect(normaliseGender("F")).toBe("female")
    expect(normaliseGender("Female")).toBe("female")
    expect(normaliseGender("FEMALE")).toBe("female")
  })

  it("returns unknown for null / empty / unrecognised", () => {
    expect(normaliseGender(null)).toBe("unknown")
    expect(normaliseGender(undefined)).toBe("unknown")
    expect(normaliseGender("")).toBe("unknown")
    expect(normaliseGender("X")).toBe("unknown")
    expect(normaliseGender("-")).toBe("unknown")
  })
})

// ─── normaliseSearchworxPhone ─────────────────────────────────────────────────

describe("normaliseSearchworxPhone", () => {
  it("returns null for null / undefined input", () => {
    expect(normaliseSearchworxPhone(null)).toBeNull()
    expect(normaliseSearchworxPhone(undefined)).toBeNull()
  })

  it("returns null for empty / dash FullNumber", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "" })).toBeNull()
    expect(normaliseSearchworxPhone({ FullNumber: "-" })).toBeNull()
    expect(normaliseSearchworxPhone({ FullNumber: "- -" })).toBeNull()
  })

  it("DialCode + Number: SA area code → +27", () => {
    expect(normaliseSearchworxPhone({ DialCode: "011", Number: "8940999" })).toBe("+27118940999")
  })

  it("DialCode + Number: international (Namibia 26464) → +26464", () => {
    expect(normaliseSearchworxPhone({ DialCode: "26464", Number: "412906" })).toBe("+26464412906")
  })

  it("DialCode + Number: bare Number without DialCode → +27", () => {
    expect(normaliseSearchworxPhone({ DialCode: "", Number: "0118940999" })).toBe("+27118940999")
  })

  it("20-char zero-padded mobile → +27", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "00000000000987676543" })).toBe("+27987676543")
  })

  it("leading-dash Combined-via-TU format: '- 0987676543' → +27", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "- 0987676543" })).toBe("+27987676543")
  })

  it("parenthesised SA area code: '(011) 8940999' → +27", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "(011) 8940999" })).toBe("+27118940999")
  })

  it("parenthesised international: '(26464) 412906' → +26464", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "(26464) 412906" })).toBe("+26464412906")
  })

  it("plain SA local 10-digit: '0118940999' → +27", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "0118940999" })).toBe("+27118940999")
  })

  it("unparseable string → null", () => {
    expect(normaliseSearchworxPhone({ FullNumber: "N/A" })).toBeNull()
    expect(normaliseSearchworxPhone({ FullNumber: "12345" })).toBeNull()
  })
})

// ─── formatSearchworxDateForRequest ──────────────────────────────────────────

describe("formatSearchworxDateForRequest", () => {
  const d = new Date("2026-05-18T00:00:00Z")

  it("ddMMyyyy", () => expect(formatSearchworxDateForRequest(d, "ddMMyyyy")).toBe("18052026"))
  it("dd/MM/yyyy", () => expect(formatSearchworxDateForRequest(d, "dd/MM/yyyy")).toBe("18/05/2026"))
  it("yyyyMMdd", () => expect(formatSearchworxDateForRequest(d, "yyyyMMdd")).toBe("20260518"))
  it("yyyy-MM-dd", () => expect(formatSearchworxDateForRequest(d, "yyyy-MM-dd")).toBe("2026-05-18"))

  it("accepts string input", () => {
    expect(formatSearchworxDateForRequest("2026-05-18", "ddMMyyyy")).toBe("18052026")
  })

  it("pads single-digit month and day", () => {
    const jan1 = new Date("2026-01-01T00:00:00Z")
    expect(formatSearchworxDateForRequest(jan1, "dd/MM/yyyy")).toBe("01/01/2026")
  })
})

// ─── parseIntOrZero + coerceNumericMap (existing) ────────────────────────────

describe("parseIntOrZero", () => {
  it("parses numeric strings", () => expect(parseIntOrZero("42")).toBe(42))
  it("returns 0 for empty / null", () => {
    expect(parseIntOrZero("")).toBe(0)
    expect(parseIntOrZero(null)).toBe(0)
    expect(parseIntOrZero("abc")).toBe(0)
  })
})

describe("coerceNumericMap", () => {
  it("converts all values to numbers", () => {
    expect(coerceNumericMap({ a: "1", b: "2", c: "abc" })).toEqual({ a: 1, b: 2, c: 0 })
  })
})
