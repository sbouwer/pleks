/**
 * lib/applications/__tests__/resendInvite.test.ts — the co-parties Resend sends what inviteRoute names, nothing else
 *
 * Notes:  Walker F2 (build-72-p1-walk, 2026-10-01): `resendDirectorInvite` sent director copy to every party the
 *         roster lists and rotated the token, so a residential guarantor got director copy (R3a) and lost their
 *         working /apply/co-applicant link, and a held surety was emailed (R3). Probed both ways: a director is
 *         rotated + sent director copy; a residential party is re-sent joint-rental copy on the SAME token; a held
 *         surety gets neither a send nor a rotation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const sendCoApplicantInvited = vi.fn(async () => ({ success: true }))
const sendDirectorInvite = vi.fn(async () => ({ success: true }))
let application: Record<string, unknown> = {}
let party: Record<string, unknown> = {}
const updates: Record<string, unknown>[] = []

vi.mock("@/lib/applications/verifyApplicantToken", () => ({ verifyApplicantToken: async () => true }))
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
  for (const m of ["select", "eq", "is"]) b[m] = () => b
  const row = table === "applications" ? { org_id: "org-1", ...application } : party
  b.maybeSingle = async () => ({ data: row, error: null })
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

import { resendDirectorInvite } from "../commercial"

const JURISTIC = { entity_type: "organisation", applicant_type: null, company_info: { companyType: "pty_ltd" } }
const RESIDENTIAL = { entity_type: "individual", applicant_type: null, company_info: null }
const baseParty = { applicant_email: "pat@test", first_name: "Pat", access_token: "old-tok", is_surety_director: false }

beforeEach(() => {
  sendCoApplicantInvited.mockClear()
  sendDirectorInvite.mockClear()
  updates.length = 0
})

describe("co-parties Resend (walker F2)", () => {
  it("a juristic director surety: token rotated to a 14-day link, director copy sent", async () => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: true }
    expect(await resendDirectorInvite("co-1", "app-1", "lead-tok")).toEqual({ ok: true })
    expect(updates).toEqual([expect.objectContaining({ access_token_expires: "EXPIRY-14D" })])
    expect(sendDirectorInvite).toHaveBeenCalledTimes(1)
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })

  it("a residential guarantor: joint-rental copy on the EXISTING token, nothing rotated (R3a)", async () => {
    application = RESIDENTIAL
    party = { ...baseParty, role: "guarantor", declared_director: null }
    expect(await resendDirectorInvite("co-1", "app-1", "lead-tok")).toEqual({ ok: true })
    expect(sendCoApplicantInvited).toHaveBeenCalledWith(
      expect.objectContaining({ email: "pat@test" }), expect.anything(), expect.anything(),
      expect.objectContaining({ accessToken: "old-tok" }),
    )
    expect(sendDirectorInvite).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it.each([false, null])("a juristic surety whose director answer is %s is HELD: no send, no rotation (R3)", async (declared) => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: declared }
    expect((await resendDirectorInvite("co-1", "app-1", "lead-tok")).ok).toBe(false)
    expect(sendDirectorInvite).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("a send that reports failure is reported as failure", async () => {
    application = RESIDENTIAL
    party = { ...baseParty, role: "co_applicant", declared_director: null }
    sendCoApplicantInvited.mockResolvedValueOnce({ success: false })
    expect((await resendDirectorInvite("co-1", "app-1", "lead-tok")).ok).toBe(false)
  })
})
