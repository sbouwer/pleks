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
  it("itemises per party with what's missing", () => {
    const r = freeAssessment(900_000, [a(), a({ role: "co_applicant", complete: false, documentsUploaded: false })])
    expect(r.readiness.items[0]).toMatchObject({ label: "Primary applicant", status: "ok" })
    expect(r.readiness.items[1].label).toBe("Co-applicant 1")
    expect(r.readiness.items[1].status).toBe("missing")
    expect(r.readiness.items[1].missing).toEqual(expect.arrayContaining(["documents", "consent"]))
  })
})

// June 2026, so VALID_ID (DOB 1992-02-20) reads as age 34.
const ASOF = new Date(2026, 5, 22)

describe("freeAssessment — identity from the SA ID (free, no gender)", () => {
  it("derives age + citizenship; not under 18", () => {
    const r = freeAssessment(900_000, [a()], { asOf: ASOF })
    expect(r.identity.ageYears).toBe(34)
    expect(r.identity.residency).toBe("citizen")
    expect(r.identity.underageCannotSign).toBe(false)
  })
  it("flags under-18 (no capacity) from a declared DOB on a passport", () => {
    const r = freeAssessment(900_000, [a({ idType: "passport", idNumber: "X1", declaredDob: "2012-01-01" })], { asOf: ASOF })
    expect(r.identity.ageYears).toBe(14)
    expect(r.identity.underageCannotSign).toBe(true)
    expect(r.identity.residency).toBe("foreign")
    expect(r.interpretations.some((i) => i.kind === "action" && /under 18/.test(i.text))).toBe(true)
  })
  it("cross-checks ID-encoded DOB against a separately-declared one", () => {
    expect(freeAssessment(900_000, [a({ declaredDob: "1992-02-20" })], { asOf: ASOF }).identity.dobMatchesDeclared).toBe(true)
    expect(freeAssessment(900_000, [a({ declaredDob: "1990-01-01" })], { asOf: ASOF }).identity.dobMatchesDeclared).toBe(false)
  })
  it("NEVER exposes gender", () => {
    expect(JSON.stringify(freeAssessment(900_000, [a()], { asOf: ASOF }))).not.toMatch(/gender|female|male/i)
  })
})

describe("freeAssessment — employment tenure (declared)", () => {
  it("computes tenure + recently-started", () => {
    const recent = freeAssessment(900_000, [a({ employmentStartDate: "2026-05-01" })], { asOf: ASOF })
    expect(recent.employment.recentlyStarted).toBe(true)
    const settled = freeAssessment(900_000, [a({ employmentStartDate: "2024-01-01" })], { asOf: ASOF })
    expect(settled.employment.recentlyStarted).toBe(false)
    expect(settled.employment.tenureMonths).toBe(29)
  })
})

describe("freeAssessment — affordability framings", () => {
  it("rand-left, income multiple, primary-alone-clears", () => {
    const r = freeAssessment(1_000_000, [a({ declaredIncomeCents: 3_000_000 })]) // R10k rent / R30k = 33%
    expect(r.randLeftAfterRentCents).toBe(2_000_000)
    expect(r.incomeMultiple).toBe(3)
    expect(r.primaryAloneClears).toBe(false) // 33% > 30%
  })
  it("detects single-income dependency (affordable only combined)", () => {
    const r = freeAssessment(1_000_000, [a({ declaredIncomeCents: 2_000_000 }), a({ role: "co_applicant", declaredIncomeCents: 2_000_000 })])
    expect(r.primaryAloneClears).toBe(false)   // rent 50% of primary alone
    expect(r.affordabilityTier).toBe("within") // 25% combined
    expect(r.coApplicantDependency).toBe(true)
  })
  it("estimated move-in = deposit + first month; falls back to 1× rent", () => {
    expect(freeAssessment(1_000_000, [a()], { depositCents: 1_500_000 }).estimatedMoveInCents).toBe(2_500_000)
    expect(freeAssessment(1_000_000, [a()]).estimatedMoveInCents).toBe(2_000_000)
  })
  it("residual after declared obligations (null when none declared)", () => {
    const withOb = freeAssessment(1_000_000, [a({ declaredIncomeCents: 3_000_000, declaredObligationsCents: 500_000 })])
    expect(withOb.randLeftAfterObligationsCents).toBe(1_500_000)
    expect(freeAssessment(1_000_000, [a({ declaredIncomeCents: 3_000_000 })]).randLeftAfterObligationsCents).toBeNull()
  })
})

describe("freeAssessment — interpretation library", () => {
  it("strong on paper when within + ready + good multiple", () => {
    const r = freeAssessment(900_000, [a({ declaredIncomeCents: 4_000_000 })], { asOf: ASOF })
    expect(r.interpretations.some((i) => i.kind === "positive" && /strong on paper/i.test(i.text))).toBe(true)
  })
  it("action read when incomplete", () => {
    const r = freeAssessment(900_000, [a({ complete: false })], { asOf: ASOF })
    expect(r.interpretations.some((i) => i.kind === "action" && /incomplete/i.test(i.text))).toBe(true)
  })
})

describe("freeAssessment — Step-1 roll-up (triage sort key)", () => {
  const docs = (present: boolean) => [
    { key: "id", label: "ID", required: true, present: true },
    { key: "bank_main", label: "Bank statement", required: true, present },
  ]
  it("verify-ready: affordable + complete + required docs present", () => {
    expect(freeAssessment(900_000, [a({ documents: docs(true) })]).rollup).toBe("verify-ready")
  })
  it("missing-docs when a required slot is absent", () => {
    const r = freeAssessment(900_000, [a({ documents: docs(false) })])
    expect(r.rollup).toBe("missing-docs")
    expect(r.allRequiredDocsPresent).toBe(false)
  })
  it("incomplete when a party hasn't finished", () => {
    expect(freeAssessment(900_000, [a({ documents: docs(true) }), a({ role: "co_applicant", complete: false })]).rollup).toBe("incomplete")
  })
  it("does-not-qualify (reds first) when declared income fails, even with docs", () => {
    expect(freeAssessment(1_500_000, [a({ declaredIncomeCents: 3_000_000, documents: docs(true) })]).rollup).toBe("does-not-qualify")
  })
})
