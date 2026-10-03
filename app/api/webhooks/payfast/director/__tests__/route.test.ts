/**
 * app/api/webhooks/payfast/director/__tests__/route.test.ts — a co party's ITN pays that party's OWN line, against its own stamp (ADDENDUM_14W §0)
 *
 * Notes:  Against fakeRateDb, signature validation and audit stubbed. The expected fee is the line's stamp, never the
 *         form's custom_str4 (our own intent round-tripped). The row is marked paid in place and fee_cents never moves
 *         — before §0 this handler upserted a born-paid row with fee_cents = the amount taken, which the immutability
 *         trigger refuses on a stamped row. Both directions on every refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as Sentry from "@sentry/nextjs"
import { fakeRateDb, type Row } from "@/lib/searchworx/rates/__tests__/fakeRateDb"

let fake = fakeRateDb()

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fake.db }))
vi.mock("@/lib/payfast/validate", () => ({ validatePayFastITN: async () => ({ valid: true }) }))
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(async () => undefined) }))

import { POST } from "../route"
import { recordAudit } from "@/lib/audit/recordAudit"

const co = (over: Row = {}): Row => ({
  id: "co-1", org_id: "org-1", primary_application_id: "app-1", stage2_consent_given_at: "2026-10-01T09:00:00Z", ...over,
})
const line = (over: Row = {}): Row => ({
  id: "line-co", org_id: "org-1", application_id: "app-1", subject_type: "co_applicant", subject_id: "co-1",
  fee_cents: 32500, pricing_policy_version: "v1-test", paid_at: null, ...over,
})

const itn = (amount = "325.00", intended = "32500", orgId = "org-1") =>
  POST(new Request("https://x/api/webhooks/payfast/director", {
    method: "POST",
    body: new URLSearchParams({
      payment_status: "COMPLETE", custom_str1: "app-1", custom_str2: "co-1", custom_str3: orgId, custom_str4: intended,
      amount_gross: amount, pf_payment_id: "pf-co",
    }).toString(),
  }))

const lines = () => fake.tables.application_screening_payments
const flagged = (reason: string) =>
  vi.mocked(Sentry.captureMessage).mock.calls.some(([, o]) => (o as { tags: { reason: string } }).tags.reason === reason)

function seed(c: Row[] = [co()], ls: Row[] = [line()]) {
  fake = fakeRateDb({ application_co_applicants: c, application_screening_payments: ls })
}

beforeEach(() => { seed(); vi.mocked(Sentry.captureMessage).mockClear() })

describe("director ITN — the party's own stamped line", () => {
  it("KNOWN-GOOD: the stamped amount → the line is marked paid in place, fee unchanged", async () => {
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(lines()).toEqual([expect.objectContaining({ id: "line-co", fee_cents: 32500, paid_at: expect.any(String), payfast_transaction_id: "pf-co" })])
  })

  it("the expected fee is the STAMP, not custom_str4 — a form claiming a lower intent cannot lower the check", async () => {
    expect(await (await itn("100.00", "10000")).json()).toMatchObject({ ok: false, reason: "amount_mismatch_underpaid" })
    expect(lines()[0].paid_at).toBeNull()
  })

  it("OVERPAID: accepted and flagged; fee_cents keeps the quote", async () => {
    expect(await (await itn("400.00")).json()).toMatchObject({ ok: true })
    expect(lines()[0]).toMatchObject({ fee_cents: 32500, paid_at: expect.any(String) })
    expect(flagged("overpaid")).toBe(true)
  })

  it("PLANTED: no stamped line → no_quoted_fee, nothing written", async () => {
    seed([co()], [])
    vi.mocked(recordAudit).mockClear()
    expect(await (await itn()).json()).toMatchObject({ ok: false, reason: "no_quoted_fee" })
    expect(lines()).toEqual([])
    // With no line row, the refusal is still audited — against the co row, so reconciliation sees the money.
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orgId: "org-1", table: "application_co_applicants", recordId: "co-1",
    }))
  })

  it("PLANTED: a co party on another org (custom_str3 forged) is not found — nothing marked", async () => {
    expect(await (await itn("325.00", "32500", "org-2")).json()).toMatchObject({ ok: false, reason: "co_applicant_not_found" })
    expect(lines()[0].paid_at).toBeNull()
  })

  it("a duplicate delivery after the line is paid changes nothing", async () => {
    seed([co()], [line({ paid_at: "2026-10-01T10:00:00Z", payfast_transaction_id: "pf-0" })])
    expect(await (await itn()).json()).toMatchObject({ ok: true, duplicate: true })
    expect(lines()[0].payfast_transaction_id).toBe("pf-0")
  })

  it("consent belt: a paid line without the party's consent is recorded and flagged", async () => {
    seed([co({ stage2_consent_given_at: null })])
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(lines()[0].paid_at).toEqual(expect.any(String))
    expect(flagged("paid_pending_consent")).toBe(true)
  })
})
