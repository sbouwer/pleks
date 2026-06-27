/**
 * useApplyFlow.test.ts — the status-menu card/credential mapping (ADDENDUM_14Q increment 2).
 *
 * buildStatusMenuData turns the company-flow progress flags into hub cards: the company card carries its own
 * progress; the director-filler gets an openable self card; co-applicants are status-only (their own link).
 */
import { describe, it, expect } from "vitest"
import { buildStatusMenuData } from "../useApplyFlow"
import type { CoApplicant } from "../applyDomain"
import type { PartyFormState } from "@/lib/parties/partyValidation"

const form = (over: Partial<PartyFormState> = {}): PartyFormState => ({ idType: "sa_id", firstName: "Di", lastName: "Rector", ...over } as PartyFormState)
const co = (over: Partial<CoApplicant> = {}): CoApplicant => ({ firstName: "Sue", lastName: "Se", email: "sue@co.za", phone: "", idNumber: "", role: "co_applicant", designation: "director", invited: false, ...over })
const base = { companyName: "Acme (Pty) Ltd", companyStarted: false, companySignedOff: false, form: form(), coApplicants: [], companyRole: "director", imDirector: true, selfSectionDone: false, selfStarted: false }

describe("buildStatusMenuData", () => {
  it("company card status tracks started → signed off", () => {
    expect(buildStatusMenuData(base).company.status).toBe("not_started")
    expect(buildStatusMenuData({ ...base, companyStarted: true }).company.status).toBe("in_progress")
    expect(buildStatusMenuData({ ...base, companyStarted: true, companySignedOff: true }).company.status).toBe("completed")
  })

  it("director-filler gets an openable self card whose status tracks their own section", () => {
    const notStarted = buildStatusMenuData(base).persons.find((p) => p.id === "self")
    expect(notStarted).toMatchObject({ name: "Di Rector", canOpen: true, status: "not_started" })
    expect(buildStatusMenuData({ ...base, selfStarted: true }).persons.find((p) => p.id === "self")?.status).toBe("in_progress")
    expect(buildStatusMenuData({ ...base, selfSectionDone: true }).persons.find((p) => p.id === "self")?.status).toBe("completed")
  })

  it("co-applicants are status-only (completes via their own link), never openable by the filler", () => {
    const r = buildStatusMenuData({ ...base, coApplicants: [co({ firstName: "Sue", designation: "director" })] })
    const sue = r.persons.find((p) => p.name === "Sue Se")
    expect(sue).toMatchObject({ canOpen: false, status: "not_started" })
    expect(sue?.statusOnlyNote).toMatch(/own link/i)
  })

  it("office-manager (not a director) → no self card, only the named directors as status-only", () => {
    const r = buildStatusMenuData({ ...base, imDirector: false, coApplicants: [co()] })
    expect(r.persons.find((p) => p.id === "self")).toBeUndefined()
    expect(r.persons).toHaveLength(1)
    expect(r.persons[0].canOpen).toBe(false)
  })
})
