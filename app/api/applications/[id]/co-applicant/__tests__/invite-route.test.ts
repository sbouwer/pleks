/**
 * app/api/applications/[id]/co-applicant/__tests__/invite-route.test.ts — the roster's FIRST invite follows inviteRoute
 *
 * Notes:  Walker F1 (build-72-p1-walk, 2026-10-01): this route sent `co_applicant_invited` to every party it
 *         inserted, so a juristic surety's first email was joint-rental copy (R3) and a held surety was emailed while
 *         the agent page said "held". Probed both ways: each kind gets exactly its copy, a held surety gets none, and
 *         a director's link carries the 14-day expiry its copy states.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const sendCoApplicantInvited = vi.fn(async () => ({ success: true }))
const sendDirectorInvite = vi.fn(async () => ({ success: true }))
let application: Record<string, unknown> = {}
const inserts: Record<string, unknown>[] = []

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
  b.update = () => ({ eq: async () => ({ error: null }) })
  return b
}
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { POST } from "../route"

const JURISTIC = { org_id: "org-1", co_applicants_count: 0, entity_type: "organisation", applicant_type: null, company_info: { companyType: "pty_ltd" } }
const RESIDENTIAL = { org_id: "org-1", co_applicants_count: 0, entity_type: "individual", applicant_type: null, company_info: null }

async function add(body: Record<string, unknown>) {
  const req = new Request("https://x", { method: "POST", body: JSON.stringify({ first_name: "Pat", email: "pat@test", ...body }) })
  return (await POST(req, { params: Promise.resolve({ id: "app-1" }) })).json()
}

beforeEach(() => {
  sendCoApplicantInvited.mockClear()
  sendDirectorInvite.mockClear()
  inserts.length = 0
})

describe("the roster's first invite (walker F1)", () => {
  it("a juristic surety declared a director gets director copy on a 14-day link, never joint-rental copy", async () => {
    application = JURISTIC
    expect(await add({ role: "guarantor", declared_director: true })).toMatchObject({ ok: true, invite: "director" })
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ coApplicantId: "co-1", token: "tok", directorEmail: "pat@test" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(inserts[0]).toMatchObject({ role: "guarantor", declared_director: true, access_token_expires: "EXPIRY-14D" })
  })

  it.each([false, undefined])("a juristic surety whose director answer is %s is HELD: inserted, nothing sent", async (declared) => {
    application = JURISTIC
    expect(await add({ role: "guarantor", declared_director: declared })).toMatchObject({ ok: true, invite: "held" })
    expect(sendDirectorInvite).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(1)
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

describe("a trustee's 'yes' is held, not sent director copy (F7 ruling)", () => {
  it("trust + declared yes → held, nothing sent", async () => {
    application = { ...JURISTIC, company_info: { companyType: "trust" } }
    expect(await add({ role: "guarantor", declared_director: true })).toMatchObject({ ok: true, invite: "held" })
    expect(sendDirectorInvite).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })
})
