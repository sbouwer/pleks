/**
 * buildCoResume.test.ts — co UniformApplicant → ResumeState (ADDENDUM_14R Phase 2, sub-step 0).
 *
 * Proves the co rehydrates into the lead's orchestrator shape: identity + section_data finances map across,
 * emailVerified is forced (token-as-proof), and POPIA isolation holds (no peer roster, individual flow).
 */
import { describe, it, expect } from "vitest"
import { buildCoResumeState } from "./buildCoResume"
import type { UniformApplicant } from "@/lib/applications/applicantAdapter"

function coApplicant(overrides: Partial<UniformApplicant> = {}): UniformApplicant {
  return {
    ref: "co_co-1", isLead: false, role: "co_applicant",
    identity: {
      firstName: "Co", lastName: "Peer", idType: "sa_id", idNumber: "9001015800089", dob: "1990-01-01",
      email: "co@example.com", phone: "0820000000", maritalStatus: "single", matrimonialRegime: null,
      spouseInfo: null, addresses: [{ line1: "1 Main" }],
    },
    employment: { type: null, employerName: null, startDate: null, details: null },
    income: { grossMonthlyCents: null, sources: null },
    obligations: { declaredMonthlyCents: null, expenses: null, dependentAdults: null, dependentMinors: null, schoolFeesCents: null },
    documents: { submitted: [], subjectRef: "co-1" },
    consentGiven: false, status: "in_progress",
    isSuretyDirector: false, startedAt: "2026-06-01T00:00:00Z", declinedAt: null,
    applicantType: null, companyInfo: null, sectionData: null,
    ...overrides,
  }
}

const CTX = { applicationId: "app-1", token: "co-token", docPaths: [{ name: "id.pdf", storagePath: "applications/o/app-1/co_co-1/id.pdf" }] }

describe("buildCoResumeState", () => {
  it("maps identity → form and forces the individual, email-verified, peerless shape", () => {
    const r = buildCoResumeState(coApplicant(), CTX)
    expect(r.applicationId).toBe("app-1")
    expect(r.token).toBe("co-token")
    expect(r.applicantType).toBe("individual")
    expect(r.company).toBeNull()
    expect(r.emailVerified).toBe(true) // token-as-proof
    expect(r.coApplicants).toEqual([]) // POPIA: no peer roster
    expect(r.docPaths).toEqual(CTX.docPaths)
    expect(r.form).toMatchObject({ firstName: "Co", lastName: "Peer", idType: "sa_id", idNumber: "9001015800089", dob: "1990-01-01", email: "co@example.com" })
    expect(r.form.addresses).toEqual([{ line1: "1 Main" }])
  })

  it("rehydrates employment/income/expenses/dependants from section_data", () => {
    const r = buildCoResumeState(coApplicant({
      sectionData: {
        employment_details: { employment_type: "permanent", employer: "Acme", start_date: "2020-01-01" },
        income_sources: [{ key: "salary", label: "Salary", amount_cents: 5_000_00, period: "month" }],
        expenses: [{ key: "rent", label: "Rent", amount_cents: 1_000_00, period: "month" }],
        dependants: { adults: 1, minors: 2, school_fees: 500 },
      },
    }), CTX)
    expect(r.emp).toMatchObject({ employment_type: "permanent", employer: "Acme", start_date: "2020-01-01" })
    expect(r.incomeSources).toEqual([{ key: "salary", label: "Salary", amount_cents: 5_000_00, period: "month" }])
    expect(r.commitments).toEqual([{ key: "rent", label: "Rent", amount_cents: 1_000_00, period: "month" }])
    expect(r.dependentAdults).toBe(1)
    expect(r.dependentMinors).toBe(2)
  })

  it("defaults finances to empty when section_data is null", () => {
    const r = buildCoResumeState(coApplicant({ sectionData: null }), CTX)
    expect(r.emp).toEqual({ employment_type: "", employer: "", start_date: "" })
    expect(r.incomeSources).toEqual([])
    expect(r.commitments).toEqual([])
    expect(r.dependentAdults).toBeNull()
  })

  it("selfDone tracks consentGiven", () => {
    expect(buildCoResumeState(coApplicant({ consentGiven: true }), CTX).selfDone).toBe(true)
    expect(buildCoResumeState(coApplicant({ consentGiven: false }), CTX).selfDone).toBe(false)
  })

  it("maps a spouse-is-the-lead link (symmetric 14M prefill)", () => {
    const r = buildCoResumeState(coApplicant({
      identity: { ...coApplicant().identity, maritalStatus: "married", matrimonialRegime: "in_community", spouseInfo: { isCoApplicant: true, email: "lead@example.com" } },
    }), CTX)
    expect(r.form.spouseIsCoApplicant).toBe(true)
    expect(r.form.spouseEmail).toBe("lead@example.com")
  })

  it("maps a named (non-co) spouse", () => {
    const r = buildCoResumeState(coApplicant({
      identity: { ...coApplicant().identity, spouseInfo: { isCoApplicant: false, firstName: "Sam", lastName: "Spouse", idNumber: "8505050050081" } },
    }), CTX)
    expect(r.form.spouseIsCoApplicant).toBe(false)
    expect(r.form.spouseFirstName).toBe("Sam")
    expect(r.form.spouseIdNumber).toBe("8505050050081")
  })
})
