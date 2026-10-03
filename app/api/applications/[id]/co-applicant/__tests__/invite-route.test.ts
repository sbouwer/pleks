/**
 * app/api/applications/[id]/co-applicant/__tests__/invite-route.test.ts — the roster's FIRST invite follows inviteRoute
 *
 * Notes:  Walker F1 (build-72-p1-walk, 2026-10-01): this route sent `co_applicant_invited` to every party it
 *         inserted, so a juristic surety's first email was joint-rental copy (R3) and a held surety was emailed while
 *         the agent page said "held". Probed both ways: each kind gets exactly its copy, and a surety's link carries the
 *         window expiry its copy states. Since the 2026-10-03 release every juristic surety is sent, with its role sentence.
 *         14W §0b: a surety's invite IS its stage-2 invite, so it is sent here only once stage 2 is open (a party added
 *         after the shortlist); before that the shortlist sends it. Probed both ways below.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const sendCoApplicantInvited = vi.fn(async () => ({ success: true }))
const sendDirectorInvite = vi.fn(async () => ({ success: true }))
let application: Record<string, unknown> = {}
const inserts: Record<string, unknown>[] = []
const updates: Record<string, unknown>[] = []

vi.mock("@/lib/security/rateLimit", () => ({ rateLimit: () => true, getClientIp: () => "ip" }))
vi.mock("@/lib/crypto/idNumber", () => ({ idNumberColumns: () => ({}) }))
vi.mock("@/lib/applications/emails", () => ({ sendCoApplicantInvited: (...a: unknown[]) => sendCoApplicantInvited(...(a as [])) }))
vi.mock("@/lib/applications/directorInvite", () => ({
  sendDirectorInvite: (...a: unknown[]) => sendDirectorInvite(...(a as [])),
  directorTokenExpiry: () => "EXPIRY-14D",
}))
vi.mock("@/lib/applications/buildEmailContext", () => ({
  buildEmailContext: async () => ({ appSummary: { firstName: "Lead", lastName: "Person" }, listingSummary: {}, orgContext: {} }),
}))

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) b[m] = () => b
  b.single = async () => table === "applications"
    ? { data: application, error: null }
    : { data: { id: "co-1", access_token: "tok" }, error: null }
  b.insert = (row: Record<string, unknown>) => { inserts.push(row); return b }
  b.update = (patch: Record<string, unknown>) => {
    updates.push(patch)
    const done: Record<string, unknown> = {}
    for (const m of ["eq", "is"]) done[m] = () => done
    done.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok)
    return done
  }
  return b
}
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { POST } from "../route"

// Added AFTER the shortlist: stage 2 is open, so a surety is invited (and its clock started) by this very add.
const JURISTIC = { org_id: "org-1", co_applicants_count: 0, entity_type: "organisation", applicant_type: null, company_info: { companyType: "pty_ltd" }, stage2_status: "invited" }
const JURISTIC_STAGE1 = { ...JURISTIC, stage2_status: null }
const RESIDENTIAL = { org_id: "org-1", co_applicants_count: 0, entity_type: "individual", applicant_type: null, company_info: null }

async function add(body: Record<string, unknown>) {
  const req = new Request("https://x", { method: "POST", body: JSON.stringify({ first_name: "Pat", email: "pat@test", ...body }) })
  return (await POST(req, { params: Promise.resolve({ id: "app-1" }) })).json()
}

beforeEach(() => {
  sendCoApplicantInvited.mockClear()
  sendDirectorInvite.mockClear()
  inserts.length = 0
  updates.length = 0
})

describe("the roster's first invite (walker F1)", () => {
  it("a juristic surety declared a director gets the director sentence on a window-long link, never joint-rental copy", async () => {
    application = JURISTIC
    expect(await add({ role: "guarantor", declared_director: true })).toMatchObject({ ok: true, invite: "surety" })
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ coApplicantId: "co-1", token: "tok", directorEmail: "pat@test", role: "director" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(inserts[0]).toMatchObject({ role: "guarantor", declared_director: true, access_token_expires: "EXPIRY-14D" })
  })

  it.each([false, undefined])("a juristic surety whose director answer is %s gets the generic (A) sentence (released 2026-10-03)", async (declared) => {
    application = JURISTIC
    expect(await add({ role: "guarantor", declared_director: declared })).toMatchObject({ ok: true, invite: "surety" })
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ role: "generic" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(inserts[0]).toMatchObject({ access_token_expires: "EXPIRY-14D" })
  })

  it("a residential guarantor gets joint-rental copy even when the answer says director (R3a)", async () => {
    application = RESIDENTIAL
    expect(await add({ role: "guarantor", declared_director: true })).toMatchObject({ invite: "co_applicant" })
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
    expect(sendDirectorInvite).not.toHaveBeenCalled()
    expect(inserts[0]).not.toHaveProperty("access_token_expires")
  })

  it("KNOWN-GOOD: a co-applicant on either kind of application gets joint-rental copy", async () => {
    for (const app of [JURISTIC, RESIDENTIAL]) {
      application = app
      expect(await add({ role: "co_applicant" })).toMatchObject({ invite: "co_applicant" })
    }
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(2)
    expect(sendDirectorInvite).not.toHaveBeenCalled()
  })
})

describe("14W §0b: a surety added BEFORE the shortlist is not invited yet", () => {
  it("juristic surety at stage 1: inserted, sent nothing, no stage-2 clock — the shortlist invites it", async () => {
    application = JURISTIC_STAGE1
    expect(await add({ role: "guarantor", declared_director: true })).toMatchObject({ ok: true, invite: "surety" })
    expect(sendDirectorInvite).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(inserts[0]).not.toHaveProperty("stage2_invited_at")
    expect(updates).not.toContainEqual(expect.objectContaining({ stage2_invited_at: expect.anything() }))
  })

  it("KNOWN-GOOD twin: the same surety added after the shortlist is sent and its clock starts", async () => {
    application = JURISTIC
    await add({ role: "guarantor", declared_director: true })
    expect(sendDirectorInvite).toHaveBeenCalledTimes(1)
    expect(updates).toContainEqual(expect.objectContaining({ stage2_invited_at: expect.any(String), access_token_expires: "EXPIRY-14D" }))
  })

  it("PLANTED (walker F5): a late surety whose invite FAILS to send gets no clock", async () => {
    application = JURISTIC
    sendDirectorInvite.mockResolvedValueOnce({ success: false })
    await add({ role: "guarantor", declared_director: true })
    expect(updates).not.toContainEqual(expect.objectContaining({ stage2_invited_at: expect.anything() }))
  })

  it("a co-applicant at stage 1 still gets its stage-1 detail invite, with no stage-2 clock", async () => {
    application = JURISTIC_STAGE1
    await add({ role: "co_applicant" })
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
    expect(updates).not.toContainEqual(expect.objectContaining({ stage2_invited_at: expect.anything() }))
  })
})

describe("a trustee's and a CC member's 'yes' get their own sentence, never the director's (F7; counsel B/C)", () => {
  it.each([["trust", "trustee"], ["cc", "member"]])("%s + declared yes → the %s sentence", async (companyType, role) => {
    application = { ...JURISTIC, company_info: { companyType } }
    expect(await add({ role: "guarantor", declared_director: true })).toMatchObject({ ok: true, invite: "surety" })
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ role }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })
})
