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
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "120000", annualTurnover: "5000000" } }))
    expect(r.isCompany).toBe(true)
    expect(r.companyVerdict).toBe("strong")        // R120k/yr → R10k/mo net ≥ R9k
    expect(r.rollup).toBe("verify-ready")
  })

  it("company: thin net + no surety → fail / does-not-qualify (turnover is ignored)", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "12000", annualTurnover: "10000000" } }))
    expect(r.companyVerdict).toBe("fail")          // R1k/mo net < R9k; the R10m turnover is NOT used
    expect(r.rollup).toBe("does-not-qualify")
  })

  it("company: net profit covers alone, but existing monthly commitments push the residual below rent → not strong", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "120000", annualTurnover: "5000000", monthlyCommitments: "5000" } }))
    expect(r.companyVerdict).toBe("fail")          // R10k/mo net − R5k commitments = R5k residual < R9k rent
  })

  it("company: residual still covers the rent after commitments → strong", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "240000", monthlyCommitments: "5000" } }))
    expect(r.companyVerdict).toBe("strong")        // R20k/mo net − R5k = R15k residual ≥ R9k
  })

  it("company: mature (by CIPC reg year) with the AFS still outstanding → screening flag in the read", () => {
    const r = assembleAssessment({
      rentCents: RENT, depositCents: null, leaseTermMonths: 12, childMaintenanceCents: 0,
      primaryDocuments: [{ key: "afs", label: "AFS", required: true, present: false }],
      app: appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "240000", companyReg: "2015/123456/07" } }),
      coRows: [],
    })
    expect(r.companyAgeYears).not.toBeNull()
    expect(r.interpretations.some((i) => /annual financial statements/i.test(i.text))).toBe(true)
  })

  it("company: thin net but a director (is_surety_director) covers → backstopped", () => {
    const r = assess(
      appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "12000" } }),
      [coRow({ is_surety_director: true, gross_monthly_income_cents: 2_000_000 })], // → guarantor role, residual R16.5k ≥ R9k
    )
    expect(r.companyVerdict).toBe("backstopped")
    expect(r.rollup).toBe("backstopped")
  })

  it("honours surety_group pooling from the DB shape (two thin directors, joint → cover)", () => {
    const r = assess(
      appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", annualProfit: "12000" } }),
      [
        coRow({ is_surety_director: true, gross_monthly_income_cents: 1_000_000, surety_group: "d" }),
        coRow({ is_surety_director: true, gross_monthly_income_cents: 1_000_000, surety_group: "d" }),
      ],
    )
    expect(r.companyVerdict).toBe("backstopped")   // R6.5k + R6.5k pooled ≥ R9k
  })

  // ── Cash-flow ledger (surplus = Σin − Σout) — the current company model; flat fields above are the fallback. ──
  const inRow = (amount: string, key = "trading_income") => ({ key, label: key, amount, period: "annual" })
  const outRow = (amount: string, key = "operating_costs") => ({ key, label: key, amount, period: "annual" })

  it("ledger: surplus (in − out) covers the rent → strong", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", ledgerIn: [inRow("360000")], ledgerOut: [outRow("120000")] } }))
    expect(r.companyVerdict).toBe("strong")        // R30k/mo in − R10k out = R20k surplus ≥ R9k
    expect(r.companyNetMonthlyCents).toBe(2_000_000)
  })

  it("ledger: thin surplus rescued by a director surety → backstopped + owner-managed read (no double-count)", () => {
    const r = assess(
      appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", ledgerIn: [inRow("360000")], ledgerOut: [outRow("336000", "salaries")] } }),
      [coRow({ is_surety_director: true, gross_monthly_income_cents: 2_000_000 })],
    )
    expect(r.companyVerdict).toBe("backstopped")   // R30k in − R28k salary = R2k surplus < R9k; director surety carries
    expect(r.interpretations.some((i) => /drawn as owner salary/i.test(i.text))).toBe(true)
    expect(r.interpretations.some((i) => /thin operating margin/i.test(i.text))).toBe(false) // ratio computed PRE owner comp
  })

  it("ledger: out > in → loss read", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", ledgerIn: [inRow("120000")], ledgerOut: [outRow("240000")] } }))
    expect(r.companyNetMonthlyCents).toBe(-1_000_000) // R10k in − R20k out
    expect(r.interpretations.some((i) => /running at a loss/i.test(i.text))).toBe(true)
  })

  it("ledger: premises rent ≥ applied rent AND relocating → demonstrated-payment read", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", premisesMove: "relocate", ledgerIn: [inRow("120000")], ledgerOut: [outRow("144000", "premises_rent")] } }))
    expect(r.interpretations.some((i) => /demonstrated payment/i.test(i.text))).toBe(true) // pays R12k, relocating, > R9k
  })

  it("ledger: same premises rent but ADDITIONAL space → NO demonstrated-payment read (would over-credit)", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", premisesMove: "additional", ledgerIn: [inRow("120000")], ledgerOut: [outRow("144000", "premises_rent")] } }))
    expect(r.interpretations.some((i) => /demonstrated payment/i.test(i.text))).toBe(false)
  })

  it("ledger: recent management-account figures → consistency read (reconciled vs AFS history at shortlist)", () => {
    const r = assess(appRow({ applicant_type: "company", company_info: { companyType: "pty_ltd", figuresSource: "management_accounts", ledgerIn: [inRow("360000")], ledgerOut: [outRow("120000")] } }))
    expect(r.interpretations.some((i) => /consistency/i.test(i.text))).toBe(true)
  })

  it("sole prop (unincorporated company_info) is NOT a company payer → personal affordability path", () => {
    // No separate legal person → net profit is irrelevant; the owner's personal income carries the rent. A thin
    // company net profit (R1k/mo) would FAIL as a juristic company, but here R40k personal income → within.
    const r = assess(appRow({ applicant_type: "company", gross_monthly_income_cents: 4_000_000, company_info: { companyType: "sole_prop", annualProfit: "12000" } }))
    expect(r.isCompany).toBe(false)                // sole prop bypasses the company-payer path
    expect(r.companyVerdict).toBeNull()            // thin net profit must NOT produce a (failing) company verdict
    expect(r.affordabilityTier).toBe("within")     // R40k personal vs R9k rent = 22.5%
  })

  it("honours marital_regime from the DB shape → spousal consent required (s15)", () => {
    const r = assess(appRow(), [coRow({ role: "guarantor", gross_monthly_income_cents: 2_000_000, marital_regime: "in_community" })])
    expect(r.spousalConsentRequired).toBe(true)
  })
})
