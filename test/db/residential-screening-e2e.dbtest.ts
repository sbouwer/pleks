/**
 * test/db/residential-screening-e2e.dbtest.ts — a residential joint application reaches the runner, every natural person on it (BUILD_72 P1-R8b probe)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db); drives the real routes by their tokens
 * Notes:  THE one end-to-end probe P1-R8b names: lead and co both consent on their own links → payable → paid → an
 *         `applicant` and a `co_applicant` payment row → both lines `ready_to_run` → the runner picks both up. Before
 *         this PR the sequence could not complete at any step after "paid": the lead had no view row, the co had no
 *         payment row and no consent surface.
 *         Real: the shortlist action's writes, invite-consent, the co screening-consent route, the billing route and
 *         its 14W gate, the application ITN, the view, the line-runner's claim and completion, and every trigger.
 *         Stubbed, and only these: the agent session (requireAgentWriteAccess → the service client for this org),
 *         the email transport (sendEmail reports success; templates still render, nothing leaves), PayFast's ITN signature, the rate READ (fixed rows through the
 *         real selectCurrentRates + formula — no global searchworx_rates rows written), and the Searchworx bundle
 *         and FitScore calls themselves: nothing here contacts a vendor.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()
let orgId = ""

const runStandardBundle = vi.fn(async (_args: { applicationId: string; subjectType: string; subjectId: string; orgId: string }) => undefined)

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/server")>()),
  requireAgentWriteAccess: async () => ({ db, userId: null, orgId }),
}))
vi.mock("@/lib/comms/send-email", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms/send-email")>()),
  sendEmail: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/lib/payfast/validate", () => ({ validatePayFastITN: async () => ({ valid: true }) }))
vi.mock("@/lib/cron/withCronRun", () => ({ withCronRun: (_n: string, h: unknown) => h }))
vi.mock("@/lib/screening/bundle-runner", () => ({ runStandardBundle: (a: Parameters<typeof runStandardBundle>[0]) => runStandardBundle(a) }))
vi.mock("@/lib/screening/fitScoreOrchestrator", () => ({ runFitScoreOrchestrator: vi.fn(async () => undefined) }))
vi.mock("@/lib/searchworx/rates/read", async (orig) => {
  const real = await orig<typeof import("@/lib/searchworx/rates/read")>()
  const rows = [
    { product_key: "combined_consumer_credit_report", cost_excl_vat_cents: 19410, effective_date: "2026-10-01", source: "pricelist_import" },
    { product_key: "vccb_income_estimator", cost_excl_vat_cents: 715, effective_date: "2026-10-01", source: "pricelist_import" },
  ]
  return { ...real, currentRates: async (keys: readonly string[], asAt: string) => real.selectCurrentRates(rows as never, keys, asAt) }
})

import { sendShortlistInvitation } from "@/lib/screening/sendShortlistInvitation"
import { POST as inviteConsent } from "@/app/api/applications/invite-consent/route"
import { POST as coConsent } from "@/app/api/applications/co-applicant/[token]/screening-consent/route"
import { POST as billing } from "@/app/api/billing/screening/route"
import { POST as itn } from "@/app/api/webhooks/payfast/application/route"
import { GET as lineRunner } from "@/app/api/cron/screening-line-runner/route"

let caller = 0
const json = (url: string, body: unknown) => {
  caller += 1
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.0.${caller}` } })
}

let appId = ""
let coId = ""
let coToken = ""
let inviteToken = ""

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  const { data: listing, error: lErr } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
  if (lErr) throw new Error(`seed listing: ${lErr.message}`)
  // A residential joint application at the end of stage 1: no phone on file, so consent records without an SMS
  // round — the lead page's own no-phone path — and the probe never touches the SMS provider.
  const { data: app, error: aErr } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listing.id, unit_id: s.unitId, entity_type: "individual", applicant_type: "individual",
      first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test`, has_co_applicant: true,
      stage1_status: "pre_screen_complete" })
    .select("id").single()
  if (aErr) throw new Error(`seed application: ${aErr.message}`)
  appId = app.id as string
  const { data: co, error: cErr } = await db.from("application_co_applicants")
    .insert({ org_id: orgId, primary_application_id: appId, co_applicant_index: 1, first_name: "Co", last_name: "Tenant",
      applicant_email: `co-${randomUUID()}@example.test`, role: "co_applicant", stage1_consent_given: true })
    .select("id, access_token").single()
  if (cErr) throw new Error(`seed co row: ${cErr.message}`)
  coId = co.id as string
  coToken = co.access_token as string
}, 120_000)
afterAll(() => { if (orgId) teardownOrg(orgId) })

async function lineStates(): Promise<Record<string, string>> {
  const { data, error } = await db.from("v_application_screening_lines").select("subject_type, subject_id, state")
    .eq("org_id", orgId).eq("application_id", appId)
  if (error) throw new Error(`read view: ${error.message}`)
  return Object.fromEntries((data ?? []).map((l) => [`${l.subject_type}:${l.subject_id}`, l.state as string]))
}

describe("BUILD_72 P1-R8b — a residential joint application, end to end", () => {
  it("1 · the shortlist invites the co party to stage 2 and starts its window", async () => {
    expect(await sendShortlistInvitation(appId)).toEqual({ success: true })
    const { data: tok, error } = await db.from("application_tokens").select("token").eq("application_id", appId).eq("token_type", "shortlist_invite").single()
    expect(error).toBeNull()
    inviteToken = tok!.token as string
    const { data: co, error: coErr } = await db.from("application_co_applicants").select("stage2_invited_at").eq("org_id", orgId).eq("id", coId).single()
    expect(coErr).toBeNull()
    expect(co!.stage2_invited_at).not.toBeNull()
  }, 60_000)

  it("2 · the lead consents on the invite link — and is NOT yet payable: the co has not (14W)", async () => {
    const res = await inviteConsent(json("http://localhost/api/applications/invite-consent", { token: inviteToken, verificationId: null }))
    expect(res.status).toBe(200)
    const { data: app, error } = await db.from("applications").select("stage2_consent_given_at, stage2_consent_ip, stage2_consent_log_id").eq("org_id", orgId).eq("id", appId).single()
    expect(error).toBeNull()
    expect(app!.stage2_consent_given_at).not.toBeNull()
    expect(app!.stage2_consent_ip, "R8b-3 side fix: the lead's row now carries the consent IP").not.toBeNull()
    expect(app!.stage2_consent_log_id, "…and its consent_log id").not.toBeNull()

    const refused = await billing(json("http://localhost/api/billing/screening", { token: inviteToken }))
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ reason: "awaiting_consent", awaiting: [{ subject_type: "co_applicant", name: "Co Tenant" }] })
  }, 60_000)

  it("3 · the co consents on its OWN link: same text version, same log shape, the party-row columns", async () => {
    const res = await coConsent(json(`http://localhost/api/applications/co-applicant/${coToken}/screening-consent`, { verificationId: null }), { params: Promise.resolve({ token: coToken }) })
    expect(res.status).toBe(200)
    const { data: co, error } = await db.from("application_co_applicants").select("stage2_consent_given_at, stage2_consent_ip, stage2_consent_log_id").eq("org_id", orgId).eq("id", coId).single()
    expect(error).toBeNull()
    expect(co!.stage2_consent_given_at).not.toBeNull()
    expect(co!.stage2_consent_ip).not.toBeNull()

    const { data: logs, error: logErr } = await db.from("consent_log").select("id, consent_type, consent_version, metadata").eq("org_id", orgId).eq("consent_type", "credit_check")
    expect(logErr).toBeNull()
    expect(logs).toHaveLength(2)
    expect(new Set(logs!.map((l) => l.consent_version))).toEqual(new Set(["1.0-searchworx-stage2"]))
    const coLog = logs!.find((l) => l.id === co!.stage2_consent_log_id)
    expect(coLog?.metadata).toMatchObject({ application_id: appId, application_co_applicant_id: coId, stage: 2 })
  }, 60_000)

  let feeCents = 0
  it("4 · payable: the billing route stamps the joint fee for two persons", async () => {
    const res = await billing(json("http://localhost/api/billing/screening", { token: inviteToken }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.is_joint).toBe(true)
    feeCents = body.fee_cents as number
    expect(feeCents).toBeGreaterThan(0)
  }, 60_000)

  it("5 · paid: the ITN writes an `applicant` row and a `co_applicant` row, born paid, summing to the fee", async () => {
    const res = await itn(new Request("http://localhost/api/webhooks/payfast/application", {
      method: "POST",
      body: new URLSearchParams({ payment_status: "COMPLETE", custom_str1: appId, amount_gross: (feeCents / 100).toFixed(2), pf_payment_id: `pf-${randomUUID()}` }).toString(),
    }))
    expect(await res.json()).toMatchObject({ ok: true })
    const { data: rows, error } = await db.from("application_screening_payments").select("subject_type, subject_id, fee_cents, paid_at").eq("org_id", orgId).eq("application_id", appId)
    expect(error).toBeNull()
    expect(rows!.map((r) => `${r.subject_type}:${r.subject_id}`).sort()).toEqual([`applicant:${appId}`, `co_applicant:${coId}`].sort())
    expect(rows!.every((r) => r.paid_at)).toBe(true)
    expect(rows!.reduce((a, r) => a + (r.fee_cents as number), 0)).toBe(feeCents)
  }, 60_000)

  it("6 · both lines read `ready_to_run`", async () => {
    expect(await lineStates()).toEqual({ [`applicant:${appId}`]: "ready_to_run", [`co_applicant:${coId}`]: "ready_to_run" })
  }, 60_000)

  it("7 · the runner picks BOTH up — the lead as an `applicant`, never a `company` — and completes them", async () => {
    const res = await lineRunner(new NextRequest("http://localhost/api/cron/screening-line-runner"))
    expect((await res.json()).ok).toBe(true)
    const ours = runStandardBundle.mock.calls.map(([a]) => a).filter((a) => a.applicationId === appId)
    expect(ours.map((a) => `${a.subjectType}:${a.subjectId}`).sort()).toEqual([`applicant:${appId}`, `co_applicant:${coId}`].sort())
    expect(await lineStates()).toEqual({ [`applicant:${appId}`]: "complete", [`co_applicant:${coId}`]: "complete" })
  }, 60_000)
})
