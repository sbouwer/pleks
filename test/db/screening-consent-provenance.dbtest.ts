/**
 * test/db/screening-consent-provenance.dbtest.ts — a stage-2 consent is only ever evidenced by the consenting person's OWN SMS round
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db); drives both record routes by their tokens
 * Notes:  BUILD_72 P1-R8 — walker F6 (72-p1-r8). The filters that bind a verification round to the person consenting
 *         are exactly the 2026-08-22 class (CLAUDE.md §6: a verified round from someone else stamped onto a consent
 *         record — provenance forgery on a POPIA s11(1)(a) record). Until this file nothing exercised them: the e2e probe
 *         records with verificationId null, so deleting any binding filter passed every suite.
 *         Three verified rounds on ONE application — the lead's, co A's, co B's — and each route must accept only its own:
 *         · invite-consent (the lead): `director_token IS NULL`;
 *         · co-applicant/[token]/screening-consent: `director_token = this token` AND `consent_type co_applicant_standard`.
 *         The rejected attempts are made FIRST, because a route that accepted one would record consent and every later
 *         attempt would read "already consented".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { POST as inviteConsent } from "@/app/api/applications/invite-consent/route"
import { POST as coConsent } from "@/app/api/applications/co-applicant/[token]/screening-consent/route"

const db = svc()
let orgId = ""
let appId = ""
let inviteToken = ""
const co: Record<"a" | "b", { id: string; token: string }> = { a: { id: "", token: "" }, b: { id: "", token: "" } }
const round: Record<"lead" | "a" | "b" | "aWrongType", string> = { lead: "", a: "", b: "", aWrongType: "" }

let caller = 0
const post = (url: string, body: unknown) => {
  caller += 1
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-forwarded-for": `10.8.0.${caller}` } })
}
const coPost = (who: "a" | "b", verificationId: string) =>
  coConsent(post(`http://localhost/api/applications/co-applicant/${co[who].token}/screening-consent`, { verificationId }),
    { params: Promise.resolve({ token: co[who].token }) })
const leadPost = (verificationId: string) =>
  inviteConsent(post("http://localhost/api/applications/invite-consent", { token: inviteToken, verificationId }))

async function verifiedRound(directorToken: string | null, consentType: string): Promise<string> {
  const { data, error } = await db.from("consent_verifications").insert({
    org_id: orgId, application_id: appId, director_token: directorToken, consent_type: consentType,
    verification_method: "sms_code", code_hash: "x", code_salt: "x",
    code_expires_at: new Date(Date.now() + 600_000).toISOString(), code_verified_at: new Date().toISOString(), status: "verified",
  }).select("id").single()
  if (error) throw new Error(`seed verification: ${error.message}`)
  return data.id as string
}

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  const { data: listing, error: lErr } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
  if (lErr) throw new Error(`seed listing: ${lErr.message}`)
  const { data: app, error: aErr } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listing.id, unit_id: s.unitId, entity_type: "individual", applicant_type: "individual",
      first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test`, stage2_status: "invited" })
    .select("id").single()
  if (aErr) throw new Error(`seed application: ${aErr.message}`)
  appId = app.id as string
  const { data: tok, error: tErr } = await db.from("application_tokens")
    .insert({ application_id: appId, token_type: "shortlist_invite", applicant_email: "lead@example.test", expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    .select("token").single()
  if (tErr) throw new Error(`seed invite token: ${tErr.message}`)
  inviteToken = tok.token as string
  for (const [i, who] of (["a", "b"] as const).entries()) {
    const { data: row, error } = await db.from("application_co_applicants")
      .insert({ org_id: orgId, primary_application_id: appId, co_applicant_index: i + 1, first_name: "Co", last_name: who.toUpperCase(),
        applicant_email: `co-${who}-${randomUUID()}@example.test`, role: "co_applicant", stage1_consent_given: true,
        stage2_invited_at: new Date().toISOString() })
      .select("id, access_token").single()
    if (error) throw new Error(`seed co ${who}: ${error.message}`)
    co[who] = { id: row.id as string, token: row.access_token as string }
  }
  round.lead = await verifiedRound(null, "standard_bundle")
  round.a = await verifiedRound(co.a.token, "co_applicant_standard")
  round.b = await verifiedRound(co.b.token, "co_applicant_standard")
  round.aWrongType = await verifiedRound(co.a.token, "director_standard")
}, 120_000)
afterAll(() => { if (orgId) teardownOrg(orgId) })

async function coConsented(who: "a" | "b"): Promise<boolean> {
  const { data, error } = await db.from("application_co_applicants").select("stage2_consent_given_at").eq("org_id", orgId).eq("id", co[who].id).single()
  if (error) throw new Error(error.message)
  return data.stage2_consent_given_at !== null
}

describe("stage-2 consent provenance — each person's own round only (walker F6)", () => {
  it("PLANTED: co A cannot record consent on the LEAD's verified round", async () => {
    expect((await coPost("a", round.lead)).status).toBe(403)
    expect(await coConsented("a")).toBe(false)
  })

  it("PLANTED: co A cannot record consent on co B's verified round", async () => {
    expect((await coPost("a", round.b)).status).toBe(403)
    expect(await coConsented("a")).toBe(false)
  })

  it("PLANTED: co A cannot use its own token's round of a DIFFERENT consent type", async () => {
    expect((await coPost("a", round.aWrongType)).status).toBe(403)
    expect(await coConsented("a")).toBe(false)
  })

  it("PLANTED: the lead cannot record consent on a co-applicant's verified round", async () => {
    expect((await leadPost(round.a)).status).toBe(403)
    const { data, error } = await db.from("applications").select("stage2_consent_given_at").eq("org_id", orgId).eq("id", appId).single()
    expect(error).toBeNull()
    expect(data!.stage2_consent_given_at).toBeNull()
  })

  it("KNOWN-GOOD: each records on its OWN round, and the log names that round", async () => {
    expect((await coPost("a", round.a)).status).toBe(200)
    expect(await coConsented("a")).toBe(true)
    expect((await leadPost(round.lead)).status).toBe(200)
    const { data, error } = await db.from("consent_verifications").select("id, consent_log_id").eq("org_id", orgId).in("id", [round.a, round.lead, round.b])
    expect(error).toBeNull()
    const linked = Object.fromEntries((data ?? []).map((r) => [r.id, r.consent_log_id]))
    expect(linked[round.a]).not.toBeNull()
    expect(linked[round.lead]).not.toBeNull()
    expect(linked[round.b], "co B's round was never used, so it is never linked").toBeNull()
  })
})
