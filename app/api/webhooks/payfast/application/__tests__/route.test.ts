/**
 * app/api/webhooks/payfast/application/__tests__/route.test.ts — the application ITN pays the lead's OWN line, against its own stamp (ADDENDUM_14W §0)
 *
 * Notes:  Against fakeRateDb, signature validation, email and audit stubbed. The payment is ONE line — `applicant` for a
 *         residential lead (never `company`), `company` for a juristic one — checked against that line's stamped fee
 *         and marked paid IN PLACE: fee_cents untouched (the immutability trigger's column), no other party's row
 *         written, nothing split. Both directions on every refusal: underpaid, no stamped line (fail closed),
 *         duplicate delivery, a lookup failure. A paid line without the lead's consent is recorded and flagged, and
 *         the runner's own ready_to_run gate is what keeps it from running.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as Sentry from "@sentry/nextjs"
import { fakeRateDb, type Row } from "@/lib/searchworx/rates/__tests__/fakeRateDb"

let fake = fakeRateDb()

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fake.db }))
vi.mock("@/lib/payfast/validate", () => ({ validatePayFastITN: async () => ({ valid: true }) }))
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock("@/lib/applications/buildEmailContext", () => ({ buildEmailContext: async () => null }))
vi.mock("@/lib/applications/emails", () => ({ sendPaymentReceived: vi.fn() }))

import { POST } from "../route"

const application = (over: Row = {}): Row => ({
  id: "app-1",
  org_id: "org-1",
  entity_type: "individual",
  applicant_type: "individual",
  company_info: null,
  fee_status: "pending",
  fee_paid_at: null,
  stage2_consent_given_at: "2026-10-01T09:00:00Z",
  ...over,
})
const COMPANY = { entity_type: "organisation", applicant_type: "company", company_info: { companyType: "pty_ltd" } }

const line = (over: Row = {}): Row => ({
  id: "line-1", org_id: "org-1", application_id: "app-1", subject_type: "applicant", subject_id: "app-1",
  fee_cents: 32500, pricing_policy_version: "v1-test", paid_at: null, ...over,
})

const itn = (amount = "325.00") =>
  POST(new Request("https://x/api/webhooks/payfast/application", {
    method: "POST",
    body: new URLSearchParams({ payment_status: "COMPLETE", custom_str1: "app-1", amount_gross: amount, pf_payment_id: "pf-1" }).toString(),
  }))

const app = () => fake.tables.applications[0]
const lines = () => fake.tables.application_screening_payments

function seed(a: Row = application(), ls: Row[] = [line()]) {
  fake = fakeRateDb({ applications: [a], application_screening_payments: ls, application_co_applicants: [] })
}

beforeEach(() => { seed(); vi.mocked(Sentry.captureMessage).mockClear() })

describe("application ITN — the lead's own line", () => {
  it("KNOWN-GOOD: the stamped amount → the line is marked paid in place and the application moves on", async () => {
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(lines()).toEqual([expect.objectContaining({ id: "line-1", fee_cents: 32500, paid_at: expect.any(String), payfast_transaction_id: "pf-1" })])
    expect(app()).toMatchObject({ fee_status: "paid", stage2_status: "screening_in_progress", searchworx_check_status: "pending", payfast_payment_id: "pf-1", fee_amount_cents: 32500 })
  })

  it("a juristic lead pays the COMPANY line — never an `applicant` line", async () => {
    seed(application(COMPANY), [line({ subject_type: "company" })])
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toMatchObject({ subject_type: "company", paid_at: expect.any(String) })
  })

  it("writes no other party's row — a co's unpaid line is left exactly as it was", async () => {
    const co = line({ id: "line-co", subject_type: "co_applicant", subject_id: "co-1", fee_cents: 32500 })
    seed(application(), [line(), co])
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(lines().find((l) => l.id === "line-co")).toEqual(co)
  })

  it("OVERPAID: accepted, flagged, and the line keeps its quoted fee", async () => {
    expect(await (await itn("400.00")).json()).toMatchObject({ ok: true })
    expect(lines()[0]).toMatchObject({ fee_cents: 32500, paid_at: expect.any(String) })
    expect(vi.mocked(Sentry.captureMessage).mock.calls.some(([, o]) => (o as { tags: { reason: string } }).tags.reason === "overpaid")).toBe(true)
  })
})

describe("application ITN — refusals fail closed", () => {
  it("PLANTED: underpaid → NOT marked paid, application untouched", async () => {
    expect(await (await itn("100.00")).json()).toMatchObject({ ok: false, reason: "amount_mismatch_underpaid" })
    expect(lines()[0].paid_at).toBeNull()
    expect(app()).toMatchObject({ fee_status: "pending", fee_paid_at: null })
  })

  it("PLANTED: no stamped line (incl. a pooled form opened before §0) → no_quoted_fee, nothing written", async () => {
    seed(application(), [])
    expect(await (await itn()).json()).toMatchObject({ ok: false, reason: "no_quoted_fee" })
    expect(lines()).toEqual([])
    expect(app().fee_status).toBe("pending")
  })

  it("PLANTED: an UNSTAMPED line row is no quote either", async () => {
    seed(application(), [line({ pricing_policy_version: null })])
    expect(await (await itn()).json()).toMatchObject({ ok: false, reason: "no_quoted_fee" })
    expect(lines()[0].paid_at).toBeNull()
  })

  it("PLANTED: a missing application → application_not_found", async () => {
    fake = fakeRateDb({ applications: [], application_screening_payments: [line()] })
    expect(await (await itn()).json()).toMatchObject({ ok: false, reason: "application_not_found" })
    expect(lines()[0].paid_at).toBeNull()
  })

  it("PLANTED: an unparseable amount is never read as 0 or NaN", async () => {
    expect(await (await itn("abc")).json()).toMatchObject({ ok: false, reason: "unparseable_amount" })
    expect(lines()[0].paid_at).toBeNull()
  })

  it("a DUPLICATE delivery after the line is paid changes nothing and re-arms nothing", async () => {
    seed(application({ fee_status: "paid", searchworx_check_status: "complete" }), [line({ paid_at: "2026-10-01T10:00:00Z", payfast_transaction_id: "pf-0" })])
    expect(await (await itn()).json()).toMatchObject({ ok: true, duplicate: true })
    expect(lines()[0]).toMatchObject({ payfast_transaction_id: "pf-0" })
    expect(app().searchworx_check_status).toBe("complete")
  })

  it("a DUPLICATE caught by the LINE alone (application not yet marked) changes nothing", async () => {
    seed(application(), [line({ paid_at: "2026-10-01T10:00:00Z", payfast_transaction_id: "pf-0" })])
    expect(await (await itn()).json()).toMatchObject({ ok: true, duplicate: true })
    expect(lines()[0]).toMatchObject({ payfast_transaction_id: "pf-0" })
    expect(app()).toMatchObject({ fee_status: "pending", fee_paid_at: null })
  })
})

describe("application ITN — the display copy", () => {
  it("an application carrying a pre-§0 stamp is marked paid WITHOUT fee_amount_cents (the immutability trigger refuses it)", async () => {
    seed(application({ pricing_policy_version: "v0-pooled", fee_amount_cents: 47000 }))
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(app()).toMatchObject({ fee_status: "paid", fee_amount_cents: 47000, stage2_status: "screening_in_progress" })
  })
})

describe("application ITN — consent belt", () => {
  it("a paid line without the lead's consent is recorded and flagged paid_pending_consent", async () => {
    seed(application({ stage2_consent_given_at: null }))
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(lines()[0].paid_at).toEqual(expect.any(String))
    expect(vi.mocked(Sentry.captureMessage).mock.calls.some(([, o]) => (o as { tags: { reason: string } }).tags.reason === "paid_pending_consent")).toBe(true)
  })
})
