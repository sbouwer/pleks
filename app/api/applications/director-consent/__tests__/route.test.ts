/**
 * app/api/applications/director-consent/__tests__/route.test.ts — a surety cannot consent before its stage-2 invite
 *
 * Notes:  14W §0b. A surety is invited at shortlist and its window runs from that invite (stage2_invited_at). Its
 *         token exists from the moment it is declared, so without this gate a link held from before the shortlist
 *         could record a POPIA consent — and open a payment — nobody had asked for yet. Probed both ways: uninvited
 *         is refused 409 with nothing written; the same row once invited records its consent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

let coApp: Record<string, unknown> = {}
const inserts: Array<{ table: string; row: unknown }> = []
const updates: Array<{ table: string; patch: unknown }> = []

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is"]) b[m] = () => b
  b.single = async () => table === "application_co_applicants"
    ? { data: coApp, error: null }
    : { data: { id: "log-1" }, error: null }
  b.insert = (row: unknown) => { inserts.push({ table, row }); return b }
  b.update = (patch: unknown) => {
    updates.push({ table, patch })
    const done: Record<string, unknown> = {}
    done.eq = () => done
    done.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok)
    return done
  }
  return b
}
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { POST } from "../route"

const base = {
  id: "co-1", org_id: "org-1", primary_application_id: "app-1", applicant_email: "s@test",
  stage2_consent_given_at: null, access_token_expires: new Date(Date.now() + 86_400_000).toISOString(), declined_at: null,
}
const consent = async () => {
  const req = new Request("https://x", { method: "POST", body: JSON.stringify({ coApplicantId: "co-1", token: "tok" }) })
  return POST(req as unknown as NextRequest)
}

beforeEach(() => {
  inserts.length = 0
  updates.length = 0
})

describe("director-consent: the stage-2 invite gate (14W §0b)", () => {
  it("PLANTED: a surety not yet invited to stage 2 is refused 409 — no consent_log row, no consent stamp", async () => {
    coApp = { ...base, stage2_invited_at: null }
    const res = await consent()
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: "not_invited" })
    expect(inserts).toEqual([])
    expect(updates).toEqual([])
  })

  it("KNOWN-GOOD twin: the same surety once invited records its consent", async () => {
    coApp = { ...base, stage2_invited_at: new Date().toISOString() }
    const res = await consent()
    expect(res.status).toBe(200)
    expect(inserts.map((i) => i.table)).toEqual(["consent_log"])
    expect(updates[0]).toMatchObject({ table: "application_co_applicants", patch: expect.objectContaining({ stage2_consent_given: true }) })
  })
})
