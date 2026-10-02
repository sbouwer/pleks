/**
 * app/api/webhooks/payfast/application/__tests__/route.test.ts — the application ITN accepts a payment only for the party set it priced (ADDENDUM_14V §3.5a/b)
 *
 * Notes:  Against fakeRateDb, signature validation, email and audit stubbed. Both directions: a payment whose live
 *         set still matches priced_party_count / priced_entity is marked paid; one where a party joined after the
 *         quote (the stamp priced one person, two are live) is refused as party_set_changed and NOT marked paid —
 *         never re-split over the new count, which is the F1 hole this closes. A stamp that recorded no set fails
 *         closed the same way.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
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
  fee_amount_cents: 32500,
  pricing_policy_version: "v1-test",
  priced_party_count: 1,
  priced_entity: false,
  ...over,
})

const coRow = (id: string): Row => ({ id, org_id: "org-1", primary_application_id: "app-1", declined_at: null })

const itn = (amount = "325.00") =>
  POST(new Request("https://x/api/webhooks/payfast/application", {
    method: "POST",
    body: new URLSearchParams({ payment_status: "COMPLETE", custom_str1: "app-1", amount_gross: amount, pf_payment_id: "pf-1" }).toString(),
  }))

const row = () => fake.tables.applications[0]

beforeEach(() => {
  fake = fakeRateDb({ applications: [application()], application_co_applicants: [] })
})

describe("application ITN — the party set the stamp priced (§3.5a/b)", () => {
  it("KNOWN-GOOD: the live set matches the stamp → marked paid", async () => {
    const res = await itn()
    expect(await res.json()).toMatchObject({ ok: true })
    expect(row()).toMatchObject({ fee_status: "paid", stage2_status: "screening_in_progress" })
  })

  it("KNOWN-GOOD: a joint application priced for two, with one live co row → marked paid", async () => {
    fake = fakeRateDb({ applications: [application({ priced_party_count: 2 })], application_co_applicants: [coRow("co-1")] })
    expect(await (await itn()).json()).toMatchObject({ ok: true })
    expect(row().fee_status).toBe("paid")
  })

  it("PLANTED: a party joined after the quote → party_set_changed, NOT marked paid, never re-split", async () => {
    fake.tables.application_co_applicants.push(coRow("co-late"))
    expect(await (await itn()).json()).toMatchObject({ ok: false, reason: "party_set_changed" })
    expect(row()).toMatchObject({ fee_status: "pending", fee_paid_at: null })
  })

  it("PLANTED: a stamp that recorded no party set fails closed", async () => {
    fake = fakeRateDb({ applications: [application({ priced_party_count: null, priced_entity: null })], application_co_applicants: [] })
    expect(await (await itn()).json()).toMatchObject({ ok: false, reason: "party_set_changed" })
    expect(row().fee_status).toBe("pending")
  })

  it("a declined co row is not part of the set", async () => {
    fake.tables.application_co_applicants.push({ ...coRow("co-gone"), declined_at: "2026-10-01T00:00:00Z" })
    expect(await (await itn()).json()).toMatchObject({ ok: true })
  })
})
