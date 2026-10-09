/**
 * lib/applications/__tests__/resendInvite.test.ts — the co-parties Resend sends what inviteRoute names, nothing else
 *
 * Notes:  Walker F2 (build-72-p1-walk, 2026-10-01): `resendDirectorInvite` sent director copy to every party the
 *         roster lists and rotated the token, so a residential guarantor got director copy (R3a) and lost their
 *         working /apply/co-applicant link, and a held surety was emailed (R3). Probed both ways: a director is
 *         rotated + sent director copy; a residential party is re-sent joint-rental copy on the SAME token. Since the
 *         2026-10-03 A/B/C release a non-director juristic surety is rotated + sent the generic (A) role sentence.
 *         14W §0b: a surety resend is refused before its stage-2 invite, and the rotated link expires at the party's
 *         OWN window end (stage2_invited_at + window), never now + window — a resend cannot buy a second window.
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
  // Echoes its anchor, so a test can see WHICH instant the window was measured from.
  directorTokenExpiry: (from = Date.now()) => new Date(from + 14 * 86_400_000).toISOString(),
}))
vi.mock("@/lib/applications/buildEmailContext", () => ({
  buildEmailContext: async () => ({ appSummary: { firstName: "Lead", lastName: "Person" }, listingSummary: {}, orgContext: {} }),
}))

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "neq"]) b[m] = () => b
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
// Invited 10 days ago: inside the window, 4 days left (rounded up).
const INVITED_AT = new Date(Date.now() - 10 * 86_400_000 - 60_000).toISOString()
const WINDOW_END = new Date(Date.parse(INVITED_AT) + 14 * 86_400_000).toISOString()
const baseParty = { applicant_email: "pat@test", first_name: "Pat", access_token: "old-tok", is_surety_director: false, stage2_invited_at: INVITED_AT }

beforeEach(() => {
  sendCoApplicantInvited.mockClear()
  sendDirectorInvite.mockClear()
  updates.length = 0
})

describe("co-parties Resend (walker F2)", () => {
  it("a juristic director surety: token rotated to a link ending at its OWN window end, director copy sent", async () => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: true }
    expect(await resendDirectorInvite("co-1", "app-1", "lead-tok")).toEqual({ ok: true })
    expect(updates).toEqual([expect.objectContaining({ access_token_expires: WINDOW_END })])
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ role: "director" }))
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

  it.each([false, null])("a juristic surety whose director answer is %s is sent the generic (A) surety copy, rotated (released 2026-10-03)", async (declared) => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: declared }
    expect(await resendDirectorInvite("co-1", "app-1", "lead-tok")).toEqual({ ok: true })
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ role: "generic" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates).toEqual([expect.objectContaining({ access_token_expires: WINDOW_END })])
  })

  it("14W §0b: a surety not yet invited to stage 2 is refused — nothing rotated, nothing sent", async () => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: true, stage2_invited_at: null }
    expect((await resendDirectorInvite("co-1", "app-1", "lead-tok")).ok).toBe(false)
    expect(updates).toEqual([])
    expect(sendDirectorInvite).not.toHaveBeenCalled()
  })

  it("KNOWN-GOOD twin: the same surety once invited is resent, its copy stating the days LEFT (walker F4)", async () => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: true }
    expect((await resendDirectorInvite("co-1", "app-1", "lead-tok")).ok).toBe(true)
    expect(updates).toEqual([expect.objectContaining({ access_token_expires: WINDOW_END })])
    expect(sendDirectorInvite).toHaveBeenCalledWith(expect.objectContaining({ ttlDays: 4 }))
  })

  it("PLANTED (walker F4): past the window a resend is refused — no dead link rotated or mailed", async () => {
    application = JURISTIC
    party = { ...baseParty, role: "guarantor", declared_director: true, stage2_invited_at: new Date(Date.now() - 15 * 86_400_000).toISOString() }
    expect((await resendDirectorInvite("co-1", "app-1", "lead-tok")).ok).toBe(false)
    expect(updates).toEqual([])
    expect(sendDirectorInvite).not.toHaveBeenCalled()
  })

  it("a send that reports failure is reported as failure", async () => {
    application = RESIDENTIAL
    party = { ...baseParty, role: "co_applicant", declared_director: null }
    sendCoApplicantInvited.mockResolvedValueOnce({ success: false })
    expect((await resendDirectorInvite("co-1", "app-1", "lead-tok")).ok).toBe(false)
  })
})
