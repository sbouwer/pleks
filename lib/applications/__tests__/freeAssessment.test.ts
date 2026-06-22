import { describe, it, expect } from "vitest"
import { freeAssessment, type FreeApplicantInput } from "../freeAssessment"

// A real, Luhn-valid SA ID (validateSAId passes); and a deliberately invalid one.
const VALID_ID = "9202204720083"
const INVALID_ID = "9202204720084"

const a = (over: Partial<FreeApplicantInput> = {}): FreeApplicantInput => ({
  role: "primary", declaredIncomeCents: 3_000_000, idType: "sa_id", idNumber: VALID_ID, complete: true, ...over,
})

describe("freeAssessment — combined declared affordability", () => {
  it("sums co-applicants vs rent (within guideline)", () => {
    const r = freeAssessment(900_000, [a(), a({ role: "co_applicant" })]) // rent 9k / income 60k = 15%
    expect(r.combinedIncomeCents).toBe(6_000_000)
    expect(r.declaredRatioPct).toBe(15)
    expect(r.affordabilityTier).toBe("within")
  })
  it("single applicant marginal / below", () => {
    expect(freeAssessment(1_000_000, [a({ declaredIncomeCents: 3_000_000 })]).affordabilityTier).toBe("marginal") // 33%
    expect(freeAssessment(1_500_000, [a({ declaredIncomeCents: 3_000_000 })]).affordabilityTier).toBe("below")    // 50%
  })
  it("EXCLUDES guarantor income from combined affordability", () => {
    const r = freeAssessment(1_000_000, [a({ declaredIncomeCents: 2_000_000 }), a({ role: "guarantor", declaredIncomeCents: 9_000_000 })])
    expect(r.combinedIncomeCents).toBe(2_000_000)  // guarantor's 90k not summed
    expect(r.affordabilityTier).toBe("below")       // 50% on the principal alone
  })
  it("no income → no-income tier", () => {
    expect(freeAssessment(900_000, [a({ declaredIncomeCents: 0 })]).affordabilityTier).toBe("no-income")
  })
})

describe("freeAssessment — readiness", () => {
  it("all complete + valid IDs → ready", () => {
    expect(freeAssessment(900_000, [a(), a({ role: "co_applicant" })]).readiness.band).toBe("ready")
  })
  it("one incomplete → partial", () => {
    const r = freeAssessment(900_000, [a(), a({ role: "co_applicant", complete: false })])
    expect(r.readiness.band).toBe("partial")
    expect(r.readiness.incompleteCount).toBe(1)
  })
  it("everyone incomplete → incomplete", () => {
    expect(freeAssessment(900_000, [a({ complete: false })]).readiness.band).toBe("incomplete")
  })
  it("invalid SA-ID checksum counts; passport is never invalid", () => {
    expect(freeAssessment(900_000, [a({ idNumber: INVALID_ID })]).readiness.invalidIdCount).toBe(1)
    expect(freeAssessment(900_000, [a({ idType: "passport", idNumber: "X1234" })]).readiness.invalidIdCount).toBe(0)
  })
})
