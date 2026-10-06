/**
 * test/db/residential-screening-e2e.dbtest.ts — a residential joint application reaches the runner, every natural person paying their own line (BUILD_72 P1-R8b probe, re-sequenced to ADDENDUM_14W §0)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db); drives the real routes by their tokens
 * Notes:  THE one end-to-end probe P1-R8b names, in the §0 order (consent → pay → run, per person): the lead consents and
 *         is payable AT ONCE for ONE person, never waiting on the co → the application ITN marks the lead's `applicant`
 *         row paid and writes no `co_applicant` row → the co consents on its own link → the payment page stamps the co's
 *         own line → the director ITN marks it paid → both lines `ready_to_run` → the runner picks both up → the co's
 *         Combined report fails on every attempt, so the runner resumes the same run for that product alone until the bound
 *         makes it terminal and records the co's refund as owed on the co's own payment row (14W §0c).
 *         Real: the shortlist action's writes, invite-consent, the co screening-consent route, the billing route and
 *         its 14W gate, both ITN handlers, stampLineFee, the view, the line-runner's claim and completion, and every trigger.
 *         Stubbed, and only these: the agent session (requireAgentWriteAccess → the service client for this org),
 *         the email transport (sendEmail reports success; templates still render, nothing leaves), PayFast's ITN signature
 *         (one validator, shared by both ITN routes), the rate READ (fixed rows through the real selectCurrentRates +
 *         formula — no global searchworx_rates rows written), and the Searchworx bundle and FitScore calls themselves:
 *         nothing here contacts a vendor.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()
let orgId = ""

type BundleCall = { applicationId: string; subjectType: string; subjectId: string; orgId: string; screeningRunId?: string; skipProducts?: readonly string[] }
const COMBINED = "combined_consumer_credit_report"
const VCCB = "vccb_income_estimator"
/** Subjects whose Combined report fails on every attempt — a bureau outage that outlasts the retry bound (14W §0c). */
const combinedDown = new Set<string>()
// Writes the lines the real bundle would, so the runner's plan reads real rows: one line per product called.
const runStandardBundle = vi.fn(async (a: BundleCall) => {
  const runId = a.screeningRunId ?? randomUUID()
  const skip = new Set(a.skipProducts ?? [])
  for (const product of [COMBINED, VCCB].filter((p) => !skip.has(p))) {
    const status = product === COMBINED && combinedDown.has(a.subjectId) ? "failed" : "completed"
    const { error } = await db.from("application_screening_lines").insert({
      org_id: a.orgId, application_id: a.applicationId, subject_type: a.subjectType, subject_id: a.subjectId,
      screening_run_id: runId, product_key: product, status, result_summary: status,
    })
    if (error) throw new Error(`mock bundle line: ${error.message}`)
  }
  return { screeningRunId: runId, combinedOk: true, vccbOk: true, combinedSummary: "", vccbSummary: "" }
})

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
import { POST as directorItn } from "@/app/api/webhooks/payfast/director/route"
import { GET as lineRunner } from "@/app/api/cron/screening-line-runner/route"
import { stampLineFee } from "@/lib/screening/lineFee"
import { quoteApplicationFee } from "@/lib/screening/quote"
import { SCREENING_CONSENT_VERSION } from "@/lib/screening/screeningConsent"

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

async function paymentRows() {
  const { data, error } = await db.from("application_screening_payments")
    .select("subject_type, subject_id, fee_cents, paid_at, pricing_policy_version").eq("org_id", orgId).eq("application_id", appId)
  if (error) throw new Error(`read payments: ${error.message}`)
  return data
}

describe("ADDENDUM_14W §0 — a residential joint application, every person paying their own line, end to end", () => {
  let leadFeeCents = 0

  it("1 · the shortlist invites the co party to stage 2 and starts its window", async () => {
    expect(await sendShortlistInvitation(appId)).toEqual({ success: true })
    const { data: tok, error } = await db.from("application_tokens").select("token").eq("application_id", appId).eq("token_type", "shortlist_invite").single()
    expect(error).toBeNull()
    inviteToken = tok!.token as string
    const { data: co, error: coErr } = await db.from("application_co_applicants").select("stage2_invited_at").eq("org_id", orgId).eq("id", coId).single()
    expect(coErr).toBeNull()
    expect(co!.stage2_invited_at).not.toBeNull()
  }, 60_000)

  it("2 · the lead consents → payable IMMEDIATELY: the billing route stamps the lead line for ONE person, the co's consent no condition", async () => {
    const res = await inviteConsent(json("http://localhost/api/applications/invite-consent", { token: inviteToken, verificationId: null }))
    expect(res.status).toBe(200)
    const { data: app, error } = await db.from("applications").select("stage2_consent_given_at, stage2_consent_ip, stage2_consent_log_id").eq("org_id", orgId).eq("id", appId).single()
    expect(error).toBeNull()
    expect(app!.stage2_consent_given_at).not.toBeNull()
    expect(app!.stage2_consent_ip, "R8b-3 side fix: the lead's row now carries the consent IP").not.toBeNull()
    expect(app!.stage2_consent_log_id, "…and its consent_log id").not.toBeNull()
    const { data: coBefore, error: coErr } = await db.from("application_co_applicants").select("stage2_consent_given_at").eq("org_id", orgId).eq("id", coId).single()
    expect(coErr).toBeNull()
    expect(coBefore!.stage2_consent_given_at, "the co has NOT consented yet").toBeNull()

    const billed = await billing(json("http://localhost/api/billing/screening", { token: inviteToken }))
    expect(billed.status).toBe(200)
    const body = await billed.json()
    expect(body.payfast_url).toBeTruthy()
    expect(body.payfast_data).toBeTruthy()
    const onePerson = await quoteApplicationFee({ juristic: false, persons: 1 }, "e2e one-person quote")
    expect(onePerson.ok).toBe(true)
    leadFeeCents = body.fee_cents as number
    expect(leadFeeCents).toBe(onePerson.ok ? onePerson.fee_cents : -1)

    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ subject_type: "applicant", subject_id: appId, fee_cents: leadFeeCents, paid_at: null })
    expect(rows[0].pricing_policy_version).not.toBeNull()
  }, 60_000)

  it("3 · the application ITN marks the `applicant` row paid in place and writes no `co_applicant` row", async () => {
    const res = await itn(new Request("http://localhost/api/webhooks/payfast/application", {
      method: "POST",
      body: new URLSearchParams({ payment_status: "COMPLETE", custom_str1: appId, amount_gross: (leadFeeCents / 100).toFixed(2), pf_payment_id: `pf-${randomUUID()}` }).toString(),
    }))
    expect(await res.json()).toMatchObject({ ok: true })
    const rows = await paymentRows()
    expect(rows.map((r) => `${r.subject_type}:${r.subject_id}`)).toEqual([`applicant:${appId}`])
    expect(rows[0].paid_at).not.toBeNull()
    expect(rows[0].fee_cents).toBe(leadFeeCents)
  }, 60_000)

  it("4 · the co consents on its OWN link: same text version, same log shape, the party-row columns", async () => {
    const res = await coConsent(json(`http://localhost/api/applications/co-applicant/${coToken}/screening-consent`, { verificationId: null }), { params: Promise.resolve({ token: coToken }) })
    expect(res.status).toBe(200)
    const { data: co, error } = await db.from("application_co_applicants").select("stage2_consent_given_at, stage2_consent_ip, stage2_consent_log_id").eq("org_id", orgId).eq("id", coId).single()
    expect(error).toBeNull()
    expect(co!.stage2_consent_given_at).not.toBeNull()
    expect(co!.stage2_consent_ip).not.toBeNull()

    const { data: logs, error: logErr } = await db.from("consent_log").select("id, consent_type, consent_version, metadata").eq("org_id", orgId).eq("consent_type", "credit_check")
    expect(logErr).toBeNull()
    expect(logs).toHaveLength(2)
    expect(new Set(logs!.map((l) => l.consent_version))).toEqual(new Set([SCREENING_CONSENT_VERSION]))
    const coLog = logs!.find((l) => l.id === co!.stage2_consent_log_id)
    expect(coLog?.metadata).toMatchObject({ application_id: appId, application_co_applicant_id: coId, stage: 2 })
  }, 60_000)

  it("5 · the co's line is stamped (the payment page's call), then the director ITN marks THAT row paid", async () => {
    const stamped = await stampLineFee(db, { orgId, applicationId: appId, subjectType: "co_applicant", subjectId: coId }, "e2e co payment page")
    expect(stamped.ok).toBe(true)
    const coFee = stamped.ok ? stamped.cents : 0
    expect(coFee).toBeGreaterThan(0)

    const res = await directorItn(new Request("http://localhost/api/webhooks/payfast/director", {
      method: "POST",
      body: new URLSearchParams({
        payment_status: "COMPLETE", custom_str1: appId, custom_str2: coId, custom_str3: orgId, custom_str4: String(coFee),
        amount_gross: (coFee / 100).toFixed(2), pf_payment_id: `pf-${randomUUID()}`,
      }).toString(),
    }))
    expect(await res.json()).toMatchObject({ ok: true })
    const rows = await paymentRows()
    expect(rows.map((r) => `${r.subject_type}:${r.subject_id}`).sort()).toEqual([`applicant:${appId}`, `co_applicant:${coId}`].sort())
    expect(rows.every((r) => r.paid_at)).toBe(true)
    expect(rows.find((r) => r.subject_type === "co_applicant")!.fee_cents).toBe(coFee)
  }, 60_000)

  it("6 · both lines read `ready_to_run`", async () => {
    expect(await lineStates()).toEqual({ [`applicant:${appId}`]: "ready_to_run", [`co_applicant:${coId}`]: "ready_to_run" })
  }, 60_000)

  it("7 · the runner picks BOTH up — the lead as an `applicant`, never a `company` — completes the lead, and sends the co's failed product back to retry", async () => {
    combinedDown.add(coId)
    const res = await lineRunner(new NextRequest("http://localhost/api/cron/screening-line-runner"))
    expect((await res.json()).ok).toBe(true)
    const ours = runStandardBundle.mock.calls.map(([a]) => a).filter((a) => a.applicationId === appId)
    expect(ours.map((a) => `${a.subjectType}:${a.subjectId}`).sort()).toEqual([`applicant:${appId}`, `co_applicant:${coId}`].sort())
    expect(await lineStates()).toEqual({ [`applicant:${appId}`]: "complete", [`co_applicant:${coId}`]: "ready_to_run" })
    const co = (await paymentRows()).find((r) => r.subject_type === "co_applicant")
    expect(co, "a retry records no refund").toBeDefined()
    const { data: owed, error } = await db.from("application_screening_payments").select("refund_amount_cents")
      .eq("org_id", orgId).eq("application_id", appId).eq("subject_type", "co_applicant").single()
    expect(error).toBeNull()
    expect(owed!.refund_amount_cents).toBeNull()
  }, 60_000)

  it("8 · each retry RESUMES the same run for the undelivered product only; the bound makes it terminal, and the refund is recorded as owed", async () => {
    for (let tick = 2; tick <= 4; tick++) {
      const res = await lineRunner(new NextRequest("http://localhost/api/cron/screening-line-runner"))
      expect((await res.json()).ok).toBe(true)
    }
    const coCalls = runStandardBundle.mock.calls.map(([a]) => a).filter((a) => a.subjectId === coId)
    expect(coCalls).toHaveLength(4)
    const firstRun = coCalls[0].screeningRunId
    expect(firstRun, "the first attempt mints its own run").toBeUndefined()
    const runIds = new Set(coCalls.slice(1).map((a) => a.screeningRunId))
    expect(runIds.size, "every retry resumes ONE run").toBe(1)
    for (const c of coCalls.slice(1)) expect(c.skipProducts, "a delivered product is never bought twice").toEqual([VCCB])

    expect(await lineStates()).toEqual({ [`applicant:${appId}`]: "complete", [`co_applicant:${coId}`]: "complete" })

    const { data: pay, error } = await db.from("application_screening_payments").select("id, fee_cents, refund_amount_cents, refunded_at")
      .eq("org_id", orgId).eq("application_id", appId).eq("subject_type", "co_applicant").single()
    expect(error).toBeNull()
    // Combined's rate share of the co's own fee, rounded up — the rates are the two fixed rows mocked above.
    expect(pay!.refund_amount_cents).toBe(Math.ceil((pay!.fee_cents * 19410) / (19410 + 715)))
    expect(pay!.refunded_at, "owed, not executed — an admin executes it").toBeNull()
    const { data: lead, error: leadErr } = await db.from("application_screening_payments").select("refund_amount_cents")
      .eq("org_id", orgId).eq("application_id", appId).eq("subject_type", "applicant").single()
    expect(leadErr).toBeNull()
    expect(lead!.refund_amount_cents, "the lead's own check delivered — nothing owed to the lead").toBeNull()

    const { data: audit, error: aErr } = await db.from("audit_log").select("record_id").eq("org_id", orgId)
      .eq("table_name", "application_screening_payments").eq("record_id", pay!.id)
    expect(aErr).toBeNull()
    expect(audit!.length).toBeGreaterThan(0)
  }, 120_000)

  it("9 · a settled subject is not re-run, and the owed refund is written once", async () => {
    const ourCalls = () => runStandardBundle.mock.calls.filter(([a]) => a.applicationId === appId).length
    const owed = async () => {
      const { data, error } = await db.from("application_screening_payments").select("refund_amount_cents")
        .eq("org_id", orgId).eq("application_id", appId).eq("subject_type", "co_applicant").single()
      if (error) throw new Error(`read owed: ${error.message}`)
      return data.refund_amount_cents as number | null
    }
    const callsBefore = ourCalls()
    const owedBefore = await owed()
    const res = await lineRunner(new NextRequest("http://localhost/api/cron/screening-line-runner"))
    expect((await res.json()).ok).toBe(true)
    expect(ourCalls()).toBe(callsBefore)
    expect(await owed()).toBe(owedBefore)
  }, 60_000)
})
