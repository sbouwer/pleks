/**
 * applySaveDraft.test.ts — the save-draft DATA CONTRACT (14Q increment 0).
 *
 * Asserts the contract that matters for resume/screening: who is recorded as primary (on-behalf company → director),
 * the school-fees split out of declared obligations, dependents math, spouse_info, and company_info gating.
 */
import { describe, it, expect } from "vitest"
import { resolvePrimary, resolveSpouseInfo, assembleSaveDraftPayload } from "../applySaveDraft"
import type { CoApplicant, Emp, IncomeRow } from "../applyDomain"
import type { PartyFormState } from "@/lib/parties/partyValidation"

const co = (over: Partial<CoApplicant> = {}): CoApplicant => ({ firstName: "Di", lastName: "Rector", email: "di@co.za", phone: "0820000000", idNumber: "9001015800087", role: "co_applicant", designation: "director", invited: false, ...over })
const form = (over: Partial<PartyFormState> = {}): PartyFormState => ({ idType: "sa_id", firstName: "Fill", lastName: "Er", email: "fill@me.za", phone: "0830000000", idNumber: "8501015800086", ...over } as PartyFormState)
const emp: Emp = { employment_type: "permanent", employer: "Acme", start_date: "2020-01-01" }
const row = (key: string, amount: string, over: Partial<IncomeRow> = {}): IncomeRow => ({ key, label: key, amount, period: "month", custom: false, ...over })

const base = { slug: "unit-1", applicationId: null, token: null, stepToSave: 3, notify: false, type: "individual" as const, companyImDirector: true, coApplicants: [], form: form(), emp, dependentAdults: "", dependentMinors: "", income: [], commitments: [], company: { companyType: "", companyReg: "" } }

describe("resolvePrimary", () => {
  it("normal path → the filler's own form is primary", () => {
    const p = resolvePrimary("couple", true, [co()], form())
    expect(p).toMatchObject({ first: "Fill", email: "fill@me.za", onBehalfCompany: false })
  })
  it("on-behalf company (filler is NOT the director) → the named director is primary, never the office manager", () => {
    const p = resolvePrimary("company", false, [co({ email: "director@co.za" })], form({ email: "office@mgr.za" }))
    expect(p).toMatchObject({ email: "director@co.za", onBehalfCompany: true })
  })
  it("company but the filler IS the director → the filler is primary", () => {
    expect(resolvePrimary("company", true, [co()], form()).onBehalfCompany).toBe(false)
  })
})

describe("resolveSpouseInfo", () => {
  it("not married in community → null", () => {
    expect(resolveSpouseInfo(form({ maritalStatus: "single" }), [])).toBeNull()
    expect(resolveSpouseInfo(form({ maritalStatus: "married", matrimonialRegime: "out_community" }), [])).toBeNull()
  })
  it("in community + spouse is the sole co-applicant → link by that co-applicant's ID number (email secondary)", () => {
    const r = resolveSpouseInfo(form({ maritalStatus: "married", matrimonialRegime: "in_community" }), [co({ email: "spouse@x.za", idNumber: "9001015800087" })])
    expect(r).toEqual({ isCoApplicant: true, idNumber: "9001015800087", email: "spouse@x.za" })
  })
  it("in community + external spouse → captured details", () => {
    const r = resolveSpouseInfo(form({ maritalStatus: "married", matrimonialRegime: "in_community", spouseIsCoApplicant: false, spouseFirstName: "Sue", spouseLastName: "Se", spouseIdNumber: "9", spouseEmail: "sue@x.za" }), [])
    expect(r).toMatchObject({ firstName: "Sue", idNumber: "9", email: "sue@x.za" })
  })
})

describe("assembleSaveDraftPayload", () => {
  it("school fees are split OUT of declared obligations and passed separately", () => {
    const p = assembleSaveDraftPayload({ ...base, commitments: [row("school_fees", "2000"), row("loan", "1000")] })
    expect(p.school_fees).toBe(2000)                 // routed to the child bucket
    expect(p.declared_monthly_obligations).toBe(1000) // obligations EXCLUDE school fees
  })
  it("dependents math: adults + minors → total; empties → null", () => {
    expect(assembleSaveDraftPayload({ ...base, dependentAdults: "1", dependentMinors: "2" })).toMatchObject({ dependent_adults: 1, dependent_minors: 2, dependents: 3 })
    expect(assembleSaveDraftPayload(base)).toMatchObject({ dependent_adults: null, dependent_minors: null, dependents: null })
  })
  it("gross_monthly_income is derived from the income grid", () => {
    expect(assembleSaveDraftPayload({ ...base, income: [row("salary", "10000"), row("bonus", "2000")] }).gross_monthly_income).toBe("12000")
  })
  it("company_info is only sent for company applications", () => {
    expect(assembleSaveDraftPayload(base).company_info).toBeNull()
    const c = { companyType: "pty_ltd", companyReg: "2020/123456/07" }
    expect(assembleSaveDraftPayload({ ...base, type: "company", company: c }).company_info).toEqual(c)
  })
  it("on-behalf company → director is primary + DOB suppressed (the office manager isn't the data subject)", () => {
    const p = assembleSaveDraftPayload({ ...base, type: "company", companyImDirector: false, coApplicants: [co({ email: "director@co.za" })], form: form({ email: "office@mgr.za", dob: "1985-01-01" }) })
    expect(p.email).toBe("director@co.za")
    expect(p.date_of_birth).toBe("")
  })
})
