/**
 * test/db/held-party-r3b.dbtest.ts — a HELD surety is outside the party set: not priced, not counted, not a payability blocker
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db); drives the billing route, the application ITN and
 *         director-consent by their tokens
 * Notes:  BUILD_72 P1-R3b, the probe it names: company + one held surety → the fee counts only the entity and the
 *         invitable sureties; payable once those consent; hold lifted after payment → that party is refused on this
 *         application (14V §3.5b, late party). Before R3b the held surety was priced AND awaited, and since nothing can
 *         ever invite them, the application was unpayable forever (walker F3, #327).
 *         The company line is priced (`entity_type = organisation`, the pricing reading). Consent for the entity line
 *         and the director surety is written directly: the consent routes are probed elsewhere
 *         (screening-consent-provenance, residential-screening-e2e); this file is about the SET.
 *         Stubbed: Sentry, PayFast's ITN signature, the email transport, the rate READ, the vendor calls.
 *         And `inviteHold`, since the 2026-10-03 release: see the stand-in below — the hold now fires for nobody real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()
let orgId = ""

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/payfast/validate", () => ({ validatePayFastITN: async () => ({ valid: true }) }))
vi.mock("@/lib/comms/send-email", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms/send-email")>()),
  sendEmail: vi.fn(async () => ({ success: true })),
}))
// Since the 2026-10-03 A/B/C release (counsel-approved comms) no real audience is held — every juristic surety has an
// approved role sentence — so a held surety can no longer be SEEDED. This stands one in: a surety answered "no" plays an
// audience with no approved copy, through the module's EXPORTED inviteHold, the one every hold reader (livePartySet →
// billing, the ITN, isLateParty) calls. What this file proves is the hold MACHINERY, which must still hold the day an
// audience without approved copy appears; without this stand-in nothing tests that direction (walker F10).
vi.mock("@/lib/applications/juristicParties", async (orig) => {
  const real = await orig<typeof import("@/lib/applications/juristicParties")>()
  const inviteHold: typeof real.inviteHold = (input) =>
    real.isSuretyParty(input.party) && input.party.declared_director === false ? "awaiting_template" : real.inviteHold(input)
  return { ...real, inviteHold }
})
vi.mock("@/lib/screening/bundle-runner", () => ({ runStandardBundle: vi.fn(async () => undefined) }))
vi.mock("@/lib/screening/fitScoreOrchestrator", () => ({ runFitScoreOrchestrator: vi.fn(async () => undefined) }))
vi.mock("@/lib/searchworx/rates/read", async (orig) => {
  const real = await orig<typeof import("@/lib/searchworx/rates/read")>()
  const rows = [
    { product_key: "combined_consumer_credit_report", cost_excl_vat_cents: 19410, effective_date: "2026-10-01", source: "pricelist_import" },
    { product_key: "vccb_income_estimator", cost_excl_vat_cents: 715, effective_date: "2026-10-01", source: "pricelist_import" },
    { product_key: "cipc_company", cost_excl_vat_cents: 3000, effective_date: "2026-10-01", source: "pricelist_import" },
    { product_key: "compuscan_company_profile", cost_excl_vat_cents: 9000, effective_date: "2026-10-01", source: "pricelist_import" },
  ]
  return { ...real, currentRates: async (keys: readonly string[], asAt: string) => real.selectCurrentRates(rows as never, keys, asAt) }
})

import { POST as billing } from "@/app/api/billing/screening/route"
import { POST as itn } from "@/app/api/webhooks/payfast/application/route"
import { POST as directorConsent } from "@/app/api/applications/director-consent/route"
import { quoteApplicationFee } from "@/lib/screening/quote"
import { isLateParty } from "@/lib/screening/partySet"

let caller = 0
const json = (url: string, body: unknown) => {
  caller += 1
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.0.${caller}` } })
}

let appId = ""
let inviteToken = ""
const party: Record<"director" | "held", { id: string; token: string }> = { director: { id: "", token: "" }, held: { id: "", token: "" } }

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  const { data: listing, error: lErr } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
  if (lErr) throw new Error(`seed listing: ${lErr.message}`)
  const { data: app, error: aErr } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listing.id, unit_id: s.unitId, entity_type: "organisation", applicant_type: "company",
      company_info: { companyType: "pty_ltd", companyName: "Probe Holdings" },
      first_name: "Lead", last_name: "Contact", applicant_email: `lead-${randomUUID()}@example.test`,
      stage1_status: "shortlisted", stage2_status: "invited" })
    .select("id").single()
  if (aErr) throw new Error(`seed application: ${aErr.message}`)
  appId = app.id as string
  const { data: tok, error: tErr } = await db.from("application_tokens")
    .insert({ application_id: appId, token_type: "shortlist_invite", applicant_email: "lead@example.test", expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    .select("token").single()
  if (tErr) throw new Error(`seed invite token: ${tErr.message}`)
  inviteToken = tok.token as string
  // A director surety (invitable) and a surety answered "no" (HELD by the stand-in above).
  for (const [i, [who, declared]] of ([["director", true], ["held", false]] as const).entries()) {
    const { data: row, error } = await db.from("application_co_applicants")
      .insert({ org_id: orgId, primary_application_id: appId, co_applicant_index: i + 1, first_name: who === "held" ? "Held" : "Director",
        last_name: "Surety", applicant_email: `${who}-${randomUUID()}@example.test`, role: "guarantor", declared_director: declared,
        stage1_consent_given: true })
      .select("id, access_token").single()
    if (error) throw new Error(`seed ${who}: ${error.message}`)
    party[who] = { id: row.id as string, token: row.access_token as string }
  }
}, 120_000)
afterAll(() => { if (orgId) teardownOrg(orgId) })

const billingPost = () => billing(json("http://localhost/api/billing/screening", { token: inviteToken }))

describe("P1-R3b — a held surety is outside the party set", () => {
  it("NOT A BLOCKER: unpayable while the entity line and the director are outstanding — the held surety is never awaited", async () => {
    const res = await billingPost()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.reason).toBe("awaiting_consent")
    expect(body.awaiting).toEqual([{ subject_type: "applicant", name: null }, { subject_type: "co_applicant", name: "Director Surety" }])
    expect(body.held).toEqual([{ name: "Held Surety", reason: expect.stringContaining("no approved invite wording") }])
  }, 60_000)

  let feeCents = 0
  it("NOT PRICED, NOT COUNTED: payable once the invitable parties consent; the fee and the stamp count the entity + 1 surety", async () => {
    const at = new Date().toISOString()
    const { error: aErr } = await db.from("applications").update({ stage2_consent_given_at: at }).eq("org_id", orgId).eq("id", appId)
    const { error: dErr } = await db.from("application_co_applicants").update({ stage2_consent_given_at: at, stage2_consent_given: true })
      .eq("org_id", orgId).eq("id", party.director.id)
    expect(aErr ?? dErr).toBeNull()

    const res = await billingPost()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.held).toHaveLength(1)
    feeCents = body.fee_cents as number

    const withoutHeld = await quoteApplicationFee({ juristic: true, persons: 1 }, "probe")
    const withHeld = await quoteApplicationFee({ juristic: true, persons: 2 }, "probe")
    expect(withoutHeld.ok && withHeld.ok).toBe(true)
    if (!withoutHeld.ok || !withHeld.ok) return
    expect(feeCents).toBe(withoutHeld.fee_cents)
    expect(feeCents, "the held surety is not in the fee").not.toBe(withHeld.fee_cents)

    const { data: stamp, error } = await db.from("applications").select("priced_party_count, priced_entity").eq("org_id", orgId).eq("id", appId).single()
    expect(error).toBeNull()
    expect(stamp).toEqual({ priced_party_count: 1, priced_entity: true })
  }, 60_000)

  it("PAID: the ITN accepts the stamp and writes the entity line + the director only — no row for the held surety", async () => {
    const res = await itn(new Request("http://localhost/api/webhooks/payfast/application", {
      method: "POST",
      body: new URLSearchParams({ payment_status: "COMPLETE", custom_str1: appId, amount_gross: (feeCents / 100).toFixed(2), pf_payment_id: `pf-${randomUUID()}` }).toString(),
    }))
    expect(await res.json()).toMatchObject({ ok: true })
    const { data: rows, error } = await db.from("application_screening_payments").select("subject_type, subject_id").eq("org_id", orgId).eq("application_id", appId)
    expect(error).toBeNull()
    expect(rows!.map((r) => `${r.subject_type}:${r.subject_id}`).sort()).toEqual([`company:${appId}`, `co_applicant:${party.director.id}`].sort())
  }, 60_000)

  it("HOLD LIFTED AFTER PAYMENT: the formerly held surety is a late party — refused on this application", async () => {
    // Counsel clears the variant / the applicant's answer changes: the party is no longer held. The paid set stays frozen.
    const { error } = await db.from("application_co_applicants").update({ declared_director: true }).eq("org_id", orgId).eq("id", party.held.id)
    expect(error).toBeNull()

    expect(await isLateParty(db, { orgId, applicationId: appId, coApplicantId: party.held.id })).toEqual({ ok: true, late: true })
    const res = await directorConsent(json("http://localhost/api/applications/director-consent", { coApplicantId: party.held.id, token: party.held.token, verificationId: null }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: "late_party" })
    const { data: row, error: rErr } = await db.from("application_co_applicants").select("stage2_consent_given_at").eq("org_id", orgId).eq("id", party.held.id).single()
    expect(rErr).toBeNull()
    expect(row!.stage2_consent_given_at, "no consent recorded for a party the payment never priced").toBeNull()
  }, 60_000)

  it("KNOWN-GOOD: a priced party on the same paid application is not late", async () => {
    expect(await isLateParty(db, { orgId, applicationId: appId, coApplicantId: party.director.id })).toEqual({ ok: true, late: false })
  }, 60_000)
})
