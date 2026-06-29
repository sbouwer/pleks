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

describe("freeAssessment — guarantor / surety backstop (residual capacity)", () => {
  const RENT = 900_000 // R9 000; living floor = R3 500/adult (350_000)
  const principal = a({ declaredIncomeCents: 2_000_000 }) // R20k vs R9k = 45% → below on its own merit

  // THE verdict-locking test: a below-income primary with a covering surety must NOT roll up does-not-qualify.
  it("primary below + covering surety → rollup BACKSTOPPED, not does-not-qualify", () => {
    const r = freeAssessment(RENT, [principal, a({ role: "guarantor", declaredIncomeCents: 2_000_000 })])
    expect(r.affordabilityTier).toBe("below")   // primary fails on its own merit
    expect(r.guarantorBacksRent).toBe(true)     // 20k − 0 − 3.5k floor = 16.5k residual ≥ 9k
    expect(r.rollup).toBe("backstopped")        // …so the surety rescues it — the OR-branch reaches the verdict
    expect(r.rollup).not.toBe("does-not-qualify")
  })
  it("stretched high-earner guarantor is no security → does-not-qualify (residual, not a multiple)", () => {
    const r = freeAssessment(RENT, [principal, a({ role: "guarantor", declaredIncomeCents: 5_000_000, declaredObligationsCents: 4_500_000 })])
    expect(r.guarantorBacksRent).toBe(false) // 50k − 45k − 3.5k = 1.5k residual < 9k, despite the big salary
    expect(r.rollup).toBe("does-not-qualify")
  })
  it("two unrelated standalone guarantors do NOT pool → does-not-qualify", () => {
    const r = freeAssessment(RENT, [principal, a({ role: "guarantor", declaredIncomeCents: 1_000_000 }), a({ role: "guarantor", declaredIncomeCents: 1_000_000 })])
    expect(r.guarantorBacksRent).toBe(false) // each: 10k − 3.5k = 6.5k < 9k; no pooling
    expect(r.rollup).toBe("does-not-qualify")
  })
  it("joint-&-several guarantors (same suretyGroup) POOL and cover → backstopped", () => {
    const r = freeAssessment(RENT, [principal, a({ role: "guarantor", declaredIncomeCents: 1_000_000, suretyGroup: "joint-1" }), a({ role: "guarantor", declaredIncomeCents: 1_000_000, suretyGroup: "joint-1" })])
    expect(r.guarantorBacksRent).toBe(true) // 6.5k + 6.5k = 13k pooled ≥ 9k
    expect(r.rollup).toBe("backstopped")
  })
  it("no guarantor + below primary → does-not-qualify", () => {
    const r = freeAssessment(RENT, [principal])
    expect(r.hasGuarantor).toBe(false)
    expect(r.guarantorBacksRent).toBe(false)
    expect(r.rollup).toBe("does-not-qualify")
  })
  it("guarantor doesn't override a primary who ALREADY affords (stays verify-ready, not backstopped)", () => {
    const r = freeAssessment(RENT, [a({ declaredIncomeCents: 5_000_000 }), a({ role: "guarantor", declaredIncomeCents: 5_000_000 })]) // 9k/50k = 18% within
    expect(r.affordabilityTier).toBe("within")
    expect(r.rollup).toBe("verify-ready") // clean pass — not "backstopped"; the surety is just extra security
  })
  it("in-community SURETY → spousal consent required (s15 MPA); ANC does not; in-community PRIMARY does NOT trigger", () => {
    expect(freeAssessment(RENT, [principal, a({ role: "guarantor", maritalRegime: "in_community" })]).spousalConsentRequired).toBe(true)
    expect(freeAssessment(RENT, [principal, a({ role: "guarantor", maritalRegime: "out_anc" })]).spousalConsentRequired).toBe(false)
    // scope is sureties only — an in-community PRIMARY/co-applicant must NOT trip surety consent
    expect(freeAssessment(RENT, [a({ maritalRegime: "in_community" }), a({ role: "co_applicant", maritalRegime: "in_community" })]).spousalConsentRequired).toBe(false)
  })
  it("spousal-consent interpretation is CONTINGENT (never co-suretyship) + tailors to load-bearing vs bonus", () => {
    // load-bearing: primary below + an in-community surety that CARRIES the rent → "relies on … contingent"
    const carried = freeAssessment(RENT, [principal, a({ role: "guarantor", declaredIncomeCents: 2_000_000, maritalRegime: "in_community" })])
    const carriedTxt = carried.interpretations.find((i) => i.kind === "action" && /s15 MPA/.test(i.text))?.text ?? ""
    expect(carriedTxt).toMatch(/relies on/i)
    expect(carriedTxt).toMatch(/contingent/i)
    expect(carriedTxt).not.toMatch(/co-sign/i)   // must NOT bake co-suretyship — instrument is counsel's choice
    // bonus: primary affords alone + an in-community surety → "own merit … additional", still contingent
    const bonus = freeAssessment(RENT, [a({ declaredIncomeCents: 5_000_000 }), a({ role: "guarantor", declaredIncomeCents: 5_000_000, maritalRegime: "in_community" })])
    const bonusTxt = bonus.interpretations.find((i) => i.kind === "action" && /s15 MPA/.test(i.text))?.text ?? ""
    expect(bonusTxt).toMatch(/own merit/i)
    expect(bonusTxt).not.toMatch(/co-sign/i)
  })
})

describe("freeAssessment — company verdict (net profit + directors' surety)", () => {
  const RENT = 900_000 // R9 000
  const director = a() // the director filling it in (primary)

  it("company net profit covers the rent → strong + verify-ready (turnover not used)", () => {
    const r = freeAssessment(RENT, [director], { company: { netProfitMonthlyCents: 1_000_000, turnoverMonthlyCents: 8_000_000 } })
    expect(r.isCompany).toBe(true)
    expect(r.companyVerdict).toBe("strong") // R10k net ≥ R9k rent
    expect(r.companyTurnoverMonthlyCents).toBe(8_000_000) // captured as context, not the test
    expect(r.rollup).toBe("verify-ready")  // company affords on its own → clean pass
  })
  it("thin net but directors' combined surety carries it → backstopped (verdict AND rollup)", () => {
    const r = freeAssessment(RENT, [director,
      a({ role: "guarantor", declaredIncomeCents: 1_000_000, suretyGroup: "dir" }),
      a({ role: "guarantor", declaredIncomeCents: 1_000_000, suretyGroup: "dir" }),
    ], { company: { netProfitMonthlyCents: 500_000 } })
    expect(r.companyVerdict).toBe("backstopped") // net R5k < R9k, but directors pool 6.5k+6.5k = 13k ≥ 9k
    expect(r.rollup).toBe("backstopped")
  })
  it("thin net and no directors' surety → fail + does-not-qualify", () => {
    const r = freeAssessment(RENT, [director], { company: { netProfitMonthlyCents: 500_000 } })
    expect(r.companyVerdict).toBe("fail")
    expect(r.rollup).toBe("does-not-qualify")
  })
  it("high turnover, loss-making net, no surety → fail (turnover is never the number)", () => {
    const r = freeAssessment(RENT, [director], { company: { netProfitMonthlyCents: 0, turnoverMonthlyCents: 10_000_000 } })
    expect(r.companyVerdict).toBe("fail")
    expect(r.rollup).toBe("does-not-qualify")
  })
  it("personal applications are not company", () => {
    expect(freeAssessment(RENT, [director]).isCompany).toBe(false)
    expect(freeAssessment(RENT, [director]).companyVerdict).toBeNull()
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

describe("freeAssessment — contract end vs lease term (declared signal)", () => {
  it("flags a stated contract ending before the lease term", () => {
    const r = freeAssessment(900_000, [a({ contractEndDate: "2026-09-01" })], { asOf: ASOF, leaseTermMonths: 12 })
    expect(r.employment.contractEndsBeforeLease).toBe(true)
    expect(r.interpretations.some((i) => i.text.includes("contract ends before the lease"))).toBe(true)
  })
  it("does not flag when the contract runs past the lease term", () => {
    const r = freeAssessment(900_000, [a({ contractEndDate: "2028-01-01" })], { asOf: ASOF, leaseTermMonths: 12 })
    expect(r.employment.contractEndsBeforeLease).toBe(false)
  })
  it("skips gracefully when the listing has no defined lease term", () => {
    const r = freeAssessment(900_000, [a({ contractEndDate: "2026-09-01" })], { asOf: ASOF })
    expect(r.employment.contractEndsBeforeLease).toBe(false)
  })
})

describe("freeAssessment — child maintenance is a reduced dependent cost, not income", () => {
  it("excludes received child maintenance from the affordability income", () => {
    const withMaint = freeAssessment(900_000, [a({ declaredIncomeCents: 3_000_000, childMaintenanceCents: 500_000 })], { asOf: ASOF })
    const without = freeAssessment(900_000, [a({ declaredIncomeCents: 2_500_000 })], { asOf: ASOF })
    expect(withMaint.combinedIncomeCents).toBe(without.combinedIncomeCents) // 3.0m − 0.5m maintenance == 2.5m
    expect(withMaint.childMaintenanceCents).toBe(500_000)
    expect(withMaint.interpretations.some((i) => i.text.includes("Child maintenance"))).toBe(true)
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
