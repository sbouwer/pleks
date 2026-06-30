/**
 * useApplyFlow.test.ts — the status-menu card/credential mapping (ADDENDUM_14Q increments 2 + 2b).
 *
 * buildStatusMenuData turns each flow's progress into hub cards. The hub is UNIVERSAL (every flow): a company card
 * only for a juristic company; the filler's own openable card for everyone (bar a juristic office-manager); co-
 * applicants/guarantors are status-only (their own link).
 */
import { describe, it, expect } from "vitest"
import { buildStatusMenuData } from "../useApplyFlow"
import type { CoApplicant } from "../applyDomain"
import type { PartyFormState } from "@/lib/parties/partyValidation"

const form = (over: Partial<PartyFormState> = {}): PartyFormState => ({ idType: "sa_id", firstName: "Di", lastName: "Rector", ...over } as PartyFormState)
const co = (over: Partial<CoApplicant> = {}): CoApplicant => ({ firstName: "Sue", lastName: "Se", email: "sue@co.za", phone: "", idNumber: "", role: "co_applicant", designation: "director", invited: false, ...over })
const base = { type: "company" as const, isJuristic: true, companyName: "Acme (Pty) Ltd", companyStarted: false, companySignedOff: false, companyEdited: false, form: form(), coApplicants: [] as CoApplicant[], companyRole: "director", imDirector: true, selfSectionDone: false, selfStarted: false, selfEdited: false, appCreated: false }

describe("buildStatusMenuData — juristic company", () => {
  it("company card status tracks started → signed off → updated", () => {
    expect(buildStatusMenuData(base).company?.status).toBe("not_started")
    expect(buildStatusMenuData({ ...base, companyStarted: true }).company?.status).toBe("in_progress")
    expect(buildStatusMenuData({ ...base, companyStarted: true, companySignedOff: true }).company?.status).toBe("completed")
    // re-edited after sign-off → Updated application (same loop as the self card)
    expect(buildStatusMenuData({ ...base, companySignedOff: true, companyEdited: true }).company?.status).toBe("updated")
  })

  it("director-filler gets an openable self card whose status tracks their own section", () => {
    expect(buildStatusMenuData(base).persons.find((p) => p.id === "self")).toMatchObject({ name: "Di Rector", canOpen: true, status: "not_started" })
    expect(buildStatusMenuData({ ...base, selfStarted: true }).persons.find((p) => p.id === "self")?.status).toBe("in_progress")
    expect(buildStatusMenuData({ ...base, selfSectionDone: true }).persons.find((p) => p.id === "self")?.status).toBe("completed")
  })

  it("14R: self card reads Start on first landing (no verify-to-start — account is at completion), then Started once entered", () => {
    expect(buildStatusMenuData(base).persons.find((p) => p.id === "self")?.status).toBe("not_started")
    expect(buildStatusMenuData({ ...base, selfStarted: true }).persons.find((p) => p.id === "self")?.status).toBe("in_progress")
  })

  it("self card flips to Updated application once edited after completion", () => {
    expect(buildStatusMenuData({ ...base, selfSectionDone: true, selfEdited: true }).persons.find((p) => p.id === "self")?.status).toBe("updated")
    // edited flag is moot until the section is done
    expect(buildStatusMenuData({ ...base, selfSectionDone: false, selfEdited: true }).persons.find((p) => p.id === "self")?.status).toBe("not_started")
  })

  it("co-directors are status-only (completes via their own link), never openable by the filler", () => {
    const sue = buildStatusMenuData({ ...base, coApplicants: [co({ designation: "director" })] }).persons.find((p) => p.name === "Sue Se")
    expect(sue).toMatchObject({ canOpen: false, status: "not_started", roleLabel: "Director" })
    expect(sue?.statusOnlyNote).toMatch(/own link/i)
  })

  it("office-manager (not a director) → no self card, only the named directors as status-only", () => {
    const r = buildStatusMenuData({ ...base, imDirector: false, coApplicants: [co()] })
    expect(r.persons.find((p) => p.id === "self")).toBeUndefined()
    expect(r.persons).toHaveLength(1)
    expect(r.persons[0].canOpen).toBe(false)
  })
})

describe("buildStatusMenuData — universal hub (non-company)", () => {
  const personal = { ...base, isJuristic: false }

  it("individual → no company card, one openable self card labelled Applicant", () => {
    const r = buildStatusMenuData({ ...personal, type: "individual" })
    expect(r.company).toBeNull()
    expect(r.persons).toHaveLength(1)
    expect(r.persons[0]).toMatchObject({ id: "self", canOpen: true, roleLabel: "Applicant" })
  })

  it("couple → self card + co-applicant labelled Co-applicant (status-only)", () => {
    const r = buildStatusMenuData({ ...personal, type: "couple", coApplicants: [co({ role: "co_applicant" })] })
    expect(r.company).toBeNull()
    expect(r.persons.find((p) => p.id === "self")?.canOpen).toBe(true)
    expect(r.persons.find((p) => p.id === "co_0")).toMatchObject({ roleLabel: "Co-applicant", canOpen: false })
  })

  it("guarantor → the backer card is labelled Guarantor (status-only)", () => {
    const r = buildStatusMenuData({ ...personal, type: "guarantor", coApplicants: [co({ role: "guarantor" })] })
    expect(r.persons.find((p) => p.id === "co_0")).toMatchObject({ roleLabel: "Guarantor", canOpen: false })
  })

  it("live co-status tri-state: invited → Started application → Completed (ADDENDUM_14Q hub)", () => {
    const args = { ...personal, type: "couple" as const, coApplicants: [co({ email: "sue@co.za", role: "co_applicant" })] }
    expect(buildStatusMenuData(args).persons.find((p) => p.id === "co_0")?.status).toBe("not_started")
    expect(buildStatusMenuData({ ...args, coStatusByEmail: { "sue@co.za": "started" } }).persons.find((p) => p.id === "co_0")?.status).toBe("in_progress")
    expect(buildStatusMenuData({ ...args, coStatusByEmail: { "sue@co.za": "completed" } }).persons.find((p) => p.id === "co_0")?.status).toBe("completed")
  })

  it("once the application exists, an un-started co reads Invitation sent (they've been emailed their link)", () => {
    const args = { ...personal, type: "couple" as const, coApplicants: [co({ email: "sue@co.za", role: "co_applicant" })], appCreated: true }
    expect(buildStatusMenuData(args).persons.find((p) => p.id === "co_0")?.status).toBe("invitation_sent")
    // started/completed from the live poll override the invitation-sent default
    expect(buildStatusMenuData({ ...args, coStatusByEmail: { "sue@co.za": "started" } }).persons.find((p) => p.id === "co_0")?.status).toBe("in_progress")
    expect(buildStatusMenuData({ ...args, coStatusByEmail: { "sue@co.za": "completed" } }).persons.find((p) => p.id === "co_0")?.status).toBe("completed")
  })
})

describe("buildStatusMenuData — co peer view (14R §5)", () => {
  const personal = { ...base, isJuristic: false }
  // coApplicants is the LEAD-perspective roster — it must NEVER render on a co's hub; the co's roster comes ONLY
  // from peerRoster (a name+status projection, no financials).
  const coView = { ...personal, type: "couple" as const, isCo: true, form: form({ firstName: "Co", lastName: "Peer" }), coApplicants: [co({ firstName: "Other", email: "other@x.za", role: "co_applicant" })], appCreated: true }

  it("ignores the lead-perspective coApplicants — without peerRoster the co sees only their own card", () => {
    const r = buildStatusMenuData(coView)
    expect(r.company).toBeNull()
    expect(r.persons).toHaveLength(1)
    expect(r.persons[0]).toMatchObject({ id: "self", canOpen: true })
    expect(r.persons.some((p) => p.id.startsWith("co_"))).toBe(false)
  })

  it("14R full peer: renders peerRoster as read-only cards — the co sees the lead (Completed) + other co's", () => {
    const r = buildStatusMenuData({ ...coView, peerRoster: [
      { id: "primary", name: "Lead Person", roleLabel: "Main applicant", status: "completed" },
      { id: "co_2", name: "Other Peer", roleLabel: "Co-applicant", status: "in_progress" },
    ] })
    expect(r.company).toBeNull() // still no company ENTITY card for a co
    expect(r.persons).toHaveLength(3) // self + 2 peers
    expect(r.persons.find((p) => p.id === "self")).toMatchObject({ canOpen: true })
    expect(r.persons.find((p) => p.id === "primary")).toMatchObject({ name: "Lead Person", roleLabel: "Main applicant", status: "completed", canOpen: false })
    expect(r.persons.find((p) => p.id === "co_2")).toMatchObject({ status: "in_progress", canOpen: false })
  })

  it("14R: the co's own card reads Start, then Completed once their section is done", () => {
    expect(buildStatusMenuData(coView).persons[0]?.status).toBe("not_started")
    expect(buildStatusMenuData({ ...coView, selfSectionDone: true }).persons[0]?.status).toBe("completed")
  })
})
