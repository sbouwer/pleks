/**
 * test/db/shortlist-invite.dbtest.ts — a triage-ticked applicant can be invited, and a failed send marks nothing invited
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db); the agent session is stubbed to this org
 * Notes:  CD ruling 2026-10-02 (#327). (1) The invite is open to stage1 `shortlisted` as well as `pre_screen_complete`
 *         — the triage tick (shortlistStage1Action) used to leave an applicant no detail-page invite at all.
 *         (2) Every send is awaited; status and stage2_invited_at are written only after every send succeeded.
 *         Real: both server actions, every DB write and trigger, email context and template rendering. Stubbed: the
 *         agent session and the email TRANSPORT (sendEmail), which each case drives to success or a planted failure
 *         by template key — so a planted failure is exactly sendEmail's own `{ success: false }` return.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()
let orgId = ""

const failTemplates = new Set<string>()
const sendEmail = vi.fn(async (p: { templateKey: string }) =>
  failTemplates.has(p.templateKey) ? { success: false, error: "planted" } : { success: true })

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/server")>()),
  requireAgentWriteAccess: async () => ({ db, userId: null, orgId }),
}))
vi.mock("@/lib/supabase/gateway", async (orig) => ({
  ...(await orig<typeof import("@/lib/supabase/gateway")>()),
  gateway: async () => ({ db, userId: null, orgId, role: "owner" }),
}))
vi.mock("@/lib/auth/can", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/can")>()), hasCapability: async () => true }))
vi.mock("@/lib/comms/send-email", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms/send-email")>()),
  sendEmail: (p: { templateKey: string }) => sendEmail(p),
}))
vi.mock("@/lib/searchworx/rates/read", async (orig) => {
  const real = await orig<typeof import("@/lib/searchworx/rates/read")>()
  const rows = [
    { product_key: "combined_consumer_credit_report", cost_excl_vat_cents: 19410, effective_date: "2026-10-01", source: "pricelist_import" },
    { product_key: "vccb_income_estimator", cost_excl_vat_cents: 715, effective_date: "2026-10-01", source: "pricelist_import" },
  ]
  return { ...real, currentRates: async (keys: readonly string[], asAt: string) => real.selectCurrentRates(rows as never, keys, asAt) }
})

import { sendShortlistInvitation } from "@/lib/screening/sendShortlistInvitation"
import { shortlistStage1Action } from "@/lib/applications/applicationActions"

const LEAD = "application.shortlisted"
const CO = "application.co_applicant_invited"

let appId = ""
let coId = ""
let listingId = ""
let unitId = ""

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  unitId = s.unitId
  const { data: listing, error: lErr } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
  if (lErr) throw new Error(`seed listing: ${lErr.message}`)
  listingId = listing.id as string
  const { data: app, error: aErr } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listingId, unit_id: unitId, entity_type: "individual", applicant_type: "individual",
      first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test`, has_co_applicant: true,
      stage1_status: "pre_screen_complete" })
    .select("id").single()
  if (aErr) throw new Error(`seed application: ${aErr.message}`)
  appId = app.id as string
  const { data: co, error: cErr } = await db.from("application_co_applicants")
    .insert({ org_id: orgId, primary_application_id: appId, co_applicant_index: 1, first_name: "Co", last_name: "Tenant",
      applicant_email: `co-${randomUUID()}@example.test`, role: "co_applicant", stage1_consent_given: true })
    .select("id").single()
  if (cErr) throw new Error(`seed co row: ${cErr.message}`)
  coId = co.id as string
}, 120_000)
afterAll(() => { if (orgId) teardownOrg(orgId) })

async function state() {
  const [{ data: app, error }, { data: co, error: coErr }] = await Promise.all([
    db.from("applications").select("stage1_status, stage2_status").eq("org_id", orgId).eq("id", appId).single(),
    db.from("application_co_applicants").select("stage2_invited_at").eq("org_id", orgId).eq("id", coId).single(),
  ])
  if (error || coErr) throw new Error(`read state: ${(error ?? coErr)!.message}`)
  return { stage1: app.stage1_status, stage2: app.stage2_status, coInvited: co.stage2_invited_at !== null }
}

const sentTemplates = () => sendEmail.mock.calls.map(([p]) => p.templateKey)

describe("stage-2 invite — tick-then-invite, and nothing marked on a failed send (CD 2026-10-02)", () => {
  it("the triage tick marks `shortlisted` and sends nothing", async () => {
    expect(await shortlistStage1Action(appId)).toMatchObject({ ok: true })
    expect(await state()).toEqual({ stage1: "shortlisted", stage2: null, coInvited: false })
    expect(sendEmail).not.toHaveBeenCalled()
  }, 60_000)

  it("PLANTED: the co party's send fails → action error, the lead is never sent, nothing marked", async () => {
    sendEmail.mockClear(); failTemplates.clear(); failTemplates.add(CO)
    expect(await sendShortlistInvitation(appId)).toEqual({ error: "Could not send the invitation" })
    expect(sentTemplates()).toEqual([CO])
    expect(await state()).toEqual({ stage1: "shortlisted", stage2: null, coInvited: false })
  }, 60_000)

  it("PLANTED: the lead's send fails → action error, nothing marked (the co party's clock does not start either)", async () => {
    sendEmail.mockClear(); failTemplates.clear(); failTemplates.add(LEAD)
    expect(await sendShortlistInvitation(appId)).toEqual({ error: "Could not send the invitation" })
    expect(sentTemplates()).toEqual([CO, LEAD])
    expect(await state()).toEqual({ stage1: "shortlisted", stage2: null, coInvited: false })
  }, 60_000)

  it("KNOWN-GOOD: a ticked applicant is invited once every send succeeds — lead and co both marked", async () => {
    sendEmail.mockClear(); failTemplates.clear()
    expect(await sendShortlistInvitation(appId)).toEqual({ success: true })
    expect(sentTemplates()).toEqual([CO, LEAD])
    expect(await state()).toEqual({ stage1: "shortlisted", stage2: "invited", coInvited: true })
  }, 60_000)

  it("an application already in stage 2 is refused, and nothing is sent", async () => {
    sendEmail.mockClear()
    expect(await sendShortlistInvitation(appId)).toEqual({ error: "This application cannot be invited to screening" })
    expect(sendEmail).not.toHaveBeenCalled()
  }, 60_000)

  it("an application still in stage 1 is refused, and nothing is sent", async () => {
    const { data: early, error } = await db.from("applications")
      .insert({ org_id: orgId, listing_id: listingId, unit_id: unitId, first_name: "Early", last_name: "Applicant",
        applicant_email: `early-${randomUUID()}@example.test` })
      .select("id").single()
    if (error) throw new Error(`seed early application: ${error.message}`)
    sendEmail.mockClear()
    expect(await sendShortlistInvitation(early.id as string)).toEqual({ error: "This application cannot be invited to screening" })
    expect(sendEmail).not.toHaveBeenCalled()
  }, 60_000)
})
