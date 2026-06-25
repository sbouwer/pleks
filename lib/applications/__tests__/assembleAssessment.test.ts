import { describe, it, expect } from "vitest"
import { assembleAssessment, annualRandsToMonthlyCents, type AssessmentAppRow, type AssessmentCoRow } from "../assembleAssessment"

// Integration over the WIRING: plain DB-shaped rows → freeAssessment → verdict. The engine is unit-tested
// separately; this proves the submit-route path actually feeds it (guarantor co-rows, company_info net profit,
// directors-as-sureties) and the verdict reaches the rollup — the gap that let a correct calculator stay unplugged.

const VALID_ID = "9202204720083"
const RENT = 900_000 // R9 000

// Primary defaults: a real director/applicant with R20k personal income (so readiness passes) + a valid ID.
const appRow = (over: Partial<AssessmentAppRow> = {}): AssessmentAppRow => ({
  gross_monthly_income_cents: 2_000_000, id_type: "sa_id", id_number: VALID_ID, ...over,
})
const coRow = (over: Partial<AssessmentCoRow> = {}): AssessmentCoRow => ({
  role: "co_applicant", id_type: "sa_id", id_number: VALID_ID, stage1_consent_given: true, ...over,
})
const assess = (app: AssessmentAppRow, coRows: AssessmentCoRow[] = []) =>
  assembleAssessment({ rentCents: RENT, depositCents: null, leaseTermMonths: 12, primaryDocuments: [], childMaintenanceCents: 0, app, coRows })

describe("annualRandsToMonthlyCents", () => {
  it("parses free-typed annual rands → monthly cents", () => {
    expect(annualRandsToMonthlyCents("2 400 000")).toBe(20_000_000) // R2.4m/yr → R200k/mo
    expect(annualRandsToMonthlyCents("R600,000")).toBe(5_000_000)   // R600k/yr → R50k/mo
    expect(annualRandsToMonthlyCents(1_200_000)).toBe(10_000_000)
  })
  it("returns null for absent / zero", () => {
    expect(annualRandsToMonthlyCents(null)).toBeNull()
    expect(annualRandsToMonthlyCents("")).toBeNull()
    expect(annualRandsToMonthlyCents("0")).toBeNull()
  })
})

describe("assembleAssessment — DB shape → verdict (the wiring)", () => {
  it("guarantor app: below primary + covering guarantor co-row → backstopped (reaches the rollup)", () => {
    const r = assess(appRow(), [coRow({ role: "guarantor", gross_monthly_income_cents: 2_000_000 })])
    expect(r.affordabilityTier).toBe("below")     // R20k primary vs R9k = 45%, fails on its own
    expect(r.guarantorBacksRent).toBe(true)
    expect(r.rollup).toBe("backstopped")          // the surety reaches the verdict end-to-end, not just an interpretation
  })

  it("company: net profit covers the rent → strong / verify-ready", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { annualProfit: "120000", annualTurnover: "5000000" } }))
    expect(r.isCompany).toBe(true)
    expect(r.companyVerdict).toBe("strong")        // R120k/yr → R10k/mo net ≥ R9k
    expect(r.rollup).toBe("verify-ready")
  })

  it("company: thin net + no surety → fail / does-not-qualify (turnover is ignored)", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { annualProfit: "12000", annualTurnover: "10000000" } }))
    expect(r.companyVerdict).toBe("fail")          // R1k/mo net < R9k; the R10m turnover is NOT used
    expect(r.rollup).toBe("does-not-qualify")
  })

  it("company: thin net but a director (is_surety_director) covers → backstopped", () => {
    const r = assess(
      appRow({ applicant_type: "company", company_info: { annualProfit: "12000" } }),
      [coRow({ is_surety_director: true, gross_monthly_income_cents: 2_000_000 })], // → guarantor role, residual R16.5k ≥ R9k
    )
    expect(r.companyVerdict).toBe("backstopped")
    expect(r.rollup).toBe("backstopped")
  })

  it("honours surety_group pooling from the DB shape (two thin directors, joint → cover)", () => {
    const r = assess(
      appRow({ applicant_type: "company", company_info: { annualProfit: "12000" } }),
      [
        coRow({ is_surety_director: true, gross_monthly_income_cents: 1_000_000, surety_group: "d" }),
        coRow({ is_surety_director: true, gross_monthly_income_cents: 1_000_000, surety_group: "d" }),
      ],
    )
    expect(r.companyVerdict).toBe("backstopped")   // R6.5k + R6.5k pooled ≥ R9k
  })

  it("honours marital_regime from the DB shape → spousal consent required (s15)", () => {
    const r = assess(appRow(), [coRow({ role: "guarantor", gross_monthly_income_cents: 2_000_000, marital_regime: "in_community" })])
    expect(r.spousalConsentRequired).toBe(true)
  })
})
