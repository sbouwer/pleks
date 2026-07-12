/**
 * lib/import/classify.test.ts — the F-7 regression: statutory-adjacent fields must FLAG, never guess
 */
import { describe, it, expect } from "vitest"
import { classifyLeaseType, classifyEscalationType } from "./classify"

describe("classifyLeaseType — the F-7 regression (Retail/Office silently became RESIDENTIAL)", () => {
  it("recognises the commercial vocabulary the old includes(\"comm\") check missed", () => {
    // Every one of these returned "residential" before — and Rule 8 then permits the residential
    // Demand-to-Vacate suite against a commercial lease.
    for (const raw of ["Retail", "Office", "Industrial", "Warehouse", "Shop", "Business Premises"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "commercial" })
    }
  })

  it("still recognises the plain commercial spellings", () => {
    for (const raw of ["Commercial", "commercial", "  COMM  "]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "commercial" })
    }
  })

  it("recognises residential explicitly — it is a VALUE, not the fallback bucket", () => {
    for (const raw of ["Residential", "residential", "Dwelling", "Flat", "Apartment", "Woonstel"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: true, value: "residential" })
    }
  })

  it("FLAGS an unrecognised value instead of defaulting it to residential", () => {
    for (const raw of ["Mixed Use", "TBC", "n/a", "Storage", "???"]) {
      expect(classifyLeaseType(raw), raw).toEqual({ ok: false, raw })
    }
  })

  it("FLAGS a contradictory value rather than letting first-match win", () => {
    expect(classifyLeaseType("Residential/Commercial")).toEqual({ ok: false, raw: "Residential/Commercial" })
  })

  it("flags empty input (nothing to classify)", () => {
    expect(classifyLeaseType("")).toEqual({ ok: false, raw: "" })
  })

  it("does not false-positive on words that merely contain a token", () => {
    // "resi" must not be matched by an unrelated word; the vocabulary is deliberately distinctive.
    expect(classifyLeaseType("Storage Unit")).toEqual({ ok: false, raw: "Storage Unit" })
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
    for (const raw of ["Market related", "Negotiable", "TBC", "As per lease", "5%"]) {
      expect(classifyEscalationType(raw), raw).toEqual({ ok: false, raw })
    }
  })

  it("FLAGS a cell naming two bases rather than taking the first", () => {
    expect(classifyEscalationType("CPI or Prime")).toEqual({ ok: false, raw: "CPI or Prime" })
  })

  it("flags empty input — absent is not \"fixed\"", () => {
    expect(classifyEscalationType("")).toEqual({ ok: false, raw: "" })
  })
})
