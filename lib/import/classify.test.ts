/**
 * lib/import/classify.test.ts — F-7: statutory-adjacent cells must FLAG, never guess
 *
 * The vocabulary cases here are not padding: each one is a real SA lease-book value that the previous two
 * implementations got wrong. Substring matching read "Warehouse" as residential (it contains "house");
 * \b-regex then refused "Townhouse" and "Woonhuis" (no boundary inside a compound). Whole-word tokens fix both.
 */
import { describe, it, expect } from "vitest"
import { classifyLeaseType, classifyEscalationType, classifyBoolean, classifyProvince } from "./classify"

describe("classifyLeaseType — the F-7 regression (Retail/Office silently became RESIDENTIAL)", () => {
  it("recognises commercial values the old includes(\"comm\") check missed", () => {
    for (const raw of ["Retail", "Office", "Industrial", "Warehouse", "Shop", "Workshop", "Business Premises", "Factory"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "commercial" })
    }
  })

  it("recognises the INFLECTIONS a whole-word vocabulary would otherwise refuse in bulk", () => {
    // Token matching cannot see inside a word: "shopping" does not match "shop". A shopping-centre agent's
    // 60-lease book would otherwise refuse wholesale — fail-closed, but its own kind of failure.
    for (const raw of ["Shopping Centre", "Warehousing", "Storage Unit", "Showroom", "Mall"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "commercial" })
    }
  })

  it("does NOT read \"Warehouse\" as residential (substring matching found \"house\" inside it)", () => {
    expect(classifyLeaseType("Warehouse")).toEqual({ ok: true, value: "commercial" })
  })

  it("recognises the residential COMPOUNDS a \\b-regex refused", () => {
    for (const raw of ["Townhouse", "Duplex", "Simplex", "Cottage", "Residence", "Bachelor", "Woonhuis", "Woonstel"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "residential" })
    }
  })

  it("recognises the plain residential values", () => {
    for (const raw of ["Residential", "residential", "Dwelling", "Flat", "Apartment", "House", "3 Bedroom House"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "residential" })
    }
  })

  it("FLAGS \"Sectional Title\" — that is a TENURE, not a use (a commercial office scheme can be sectional title)", () => {
    expect(classifyLeaseType("Sectional Title")).toEqual({ ok: false, raw: "Sectional Title" })
  })

  it("FLAGS an unrecognised value instead of defaulting it to residential", () => {
    for (const raw of ["Mixed Use", "TBC", "n/a", "???", ""]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: false, raw })
    }
  })

  it("FLAGS a contradictory value rather than letting first-match win", () => {
    expect(classifyLeaseType("Residential/Commercial")).toEqual({ ok: false, raw: "Residential/Commercial" })
  })

  it("reads hyphenated compounds by token (\"Semi-Commercial\")", () => {
    expect(classifyLeaseType("Semi-Commercial")).toEqual({ ok: true, value: "commercial" })
  })
})

describe("classifyEscalationType — the F-7 regression (everything unknown became \"fixed\")", () => {
  it("recognises each escalation basis", () => {
    expect(classifyEscalationType("CPI")).toEqual({ ok: true, value: "cpi" })
    expect(classifyEscalationType("Consumer Price Index")).toEqual({ ok: true, value: "cpi" })
    expect(classifyEscalationType("Prime + 2%")).toEqual({ ok: true, value: "prime_plus" })
    expect(classifyEscalationType("Fixed")).toEqual({ ok: true, value: "fixed" })
  })

  it("FLAGS an unrecognised basis instead of silently making it \"fixed\" (a money term)", () => {
    for (const raw of ["Market related", "Negotiable", "TBC", "As per lease", "5%", ""]) {
      expect(classifyEscalationType(raw), raw).toEqual({ ok: false, raw })
    }
  })

  it("FLAGS a cell naming two bases rather than taking the first", () => {
    expect(classifyEscalationType("CPI or Prime")).toEqual({ ok: false, raw: "CPI or Prime" })
  })
})

describe("classifyBoolean — an unrecognised value is NOT false", () => {
  // cpa_applies and is_fixed_term are NOT NULL DEFAULT **true**. The old normaliseBoolean returned false for
  // anything it did not recognise, so a book exporting Y/N imported cpa_applies=false on EVERY lease —
  // stripping CPA s14 protection portfolio-wide — and is_fixed_term=false, making every fixed term open-ended.
  it("reads the SA Y/N convention the old parser silently turned to false", () => {
    for (const raw of ["Y", "y", "Yes", "TRUE", "1", "Ja", "J"]) {
      expect(classifyBoolean(raw), raw).toEqual({ ok: true, value: true })
    }
    for (const raw of ["N", "n", "No", "FALSE", "0", "Nee"]) {
      expect(classifyBoolean(raw), raw).toEqual({ ok: true, value: false })
    }
  })

  it("FLAGS anything else — never fails toward false", () => {
    for (const raw of ["maybe", "n/a", "-", ""]) {
      expect(classifyBoolean(raw), raw).toEqual({ ok: false, raw })
    }
  })
})

describe("classifyProvince — tolerant, because a miss refuses the whole property (and its units and leases)", () => {
  it("accepts the CHECK-constraint spellings", () => {
    expect(classifyProvince("Western Cape")).toEqual({ ok: true, value: "Western Cape" })
    expect(classifyProvince("KwaZulu-Natal")).toEqual({ ok: true, value: "KwaZulu-Natal" })
    expect(classifyProvince("North West")).toEqual({ ok: true, value: "North West" })
  })

  it("accepts abbreviations", () => {
    expect(classifyProvince("WC")).toEqual({ ok: true, value: "Western Cape" })
    expect(classifyProvince("kzn")).toEqual({ ok: true, value: "KwaZulu-Natal" })
    expect(classifyProvince("GP")).toEqual({ ok: true, value: "Gauteng" })
  })

  it("accepts the real-world formatting quirks that used to cost an agency a whole building", () => {
    expect(classifyProvince("Gauteng Province")).toEqual({ ok: true, value: "Gauteng" })
    expect(classifyProvince("Western Cape.")).toEqual({ ok: true, value: "Western Cape" })
    expect(classifyProvince("Kwa-Zulu Natal")).toEqual({ ok: true, value: "KwaZulu-Natal" })
    expect(classifyProvince("Eastern-Cape")).toEqual({ ok: true, value: "Eastern Cape" })
    expect(classifyProvince("Gauteng, South Africa")).toEqual({ ok: true, value: "Gauteng" })
    expect(classifyProvince("Wes-Kaap")).toEqual({ ok: true, value: "Western Cape" })
    expect(classifyProvince("Noord-Wes")).toEqual({ ok: true, value: "North West" })
  })

  it("does not let a short key shadow a longer province name", () => {
    expect(classifyProvince("Northern Cape")).toEqual({ ok: true, value: "Northern Cape" })
    expect(classifyProvince("KwaZulu Natal")).toEqual({ ok: true, value: "KwaZulu-Natal" })
  })

  it("still flags a genuinely unknown province", () => {
    for (const raw of ["Transvaal", "n/a", ""]) {
      expect(classifyProvince(raw), raw).toEqual({ ok: false, raw })
    }
  })
})
