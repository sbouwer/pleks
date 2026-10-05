/**
 * app/api/cron/screening-portal-reminders/__tests__/surety-only.test.ts — reminder copy is routed by party_kind
 *
 * Notes:  BUILD_72 P1-R1 (census build-72-p1 row 29) + P1-R3/R5/R6. The view lists every live co-applicant as a
 *         line; this cron used to send every one of them director copy. Probed both ways per branch:
 *         · a residential co-applicant gets `co_applicant_invited` verbatim, never director copy (R5), and is
 *           declined 14 days after its stage-2 invite with the payment row untouched — refunds are struck (R6, 14W);
 *         · both residential clocks run from `stage2_invited_at`, never `created_at`, and an uninvited party is left
 *           alone (BUILD_72 P1-R8b-2);
 *         · a declared director surety still gets director copy, so a router that sent nothing would fail;
 *         · since the 2026-10-03 A/B/C release a non-director surety, and a trustee's or CC member's "yes", is reminded
 *           with the role-neutral reminder and expires at the window like a director — no surety is held;
 *         · an unknown party_kind is skipped;
 *         · a send that reports failure is on the 14X trail as a FAILED attempt, so the next run retries it (walker F4).
 *         ADDENDUM_14X: the trail (mocked here; the table is probed in test/db/notification-trail-immutable.dbtest.ts) decides what is due;
 *         only the latest due milestone is sent; the surety's primary contact is told at N4 only; and the lead is
 *         reminded at N2/N4 with the shortlist email on its live token, or flagged when it has none.
 *         14W §0b, ONE CLOCK: a surety's window runs from its own stage2_invited_at too (it is invited at shortlist now);
 *         a party that consented but has not paid its own line is declined at the deadline like anyone, never chased;
 *         a PAID line without consent is never declined (flagged instead); and every decline offers the application to
 *         the FitScore orchestrator, since the set it leaves may now be complete.
 *         14X P4: N5 at D − 24h (every party kind, consented-unpaid included) and N6′ at D (a declined co party; a
 *         surety's is the approved expiry notice, now trailed; a lapsed lead's from its own scan) are new copy, HELD
 *         until counsel approves it — so no email, and one gap row each (recordGap is mocked; its once-only guard is
 *         probed in lib/screening/__tests__/milestoneNotices.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

// The real SendEmailResult shape: failure is a RETURN value, never a throw (walker F4).
const sendEmail = vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))
const sendCoApplicantInvited = vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))
const maybeFireAllGreen = vi.fn()
const maybeRunOrchestrator = vi.fn()
const captureMessage = vi.fn()
// The deadline decline re-reads the party's own line (walker 14w-s0b F3), and counts the rows its update touched (F6).
let freshPaidAt: string | null = null
let declinedRows: unknown[] = [{ id: "co-1" }]
let coApp: Record<string, unknown> = {}
let line: Record<string, unknown> = {}
// The application the surety branch reads for inviteRoute (F7): a company by default; tests switch the type.
let companyType = "pty_ltd"
const updates: Array<{ table: string; patch: unknown }> = []
// 14X: the trail is the only record of what was sent. sentOk is what milestonesSentOk reports; trailRows what was written.
let sentOk = new Set<string>()
const trailRows: Array<Record<string, unknown>> = []
// The lead branch: the applications awaiting stage 2, the lead's own view line, and its live shortlist token.
let leads: unknown[] = []
let leadLine: Record<string, unknown> | null = null
let liveToken: Record<string, unknown> | null = { token: "lead-tok" }
// 14X N6′: the leads whose own D has passed (the scan bounded by .lte), and every held gap the cron recorded.
let lapsedLeads: unknown[] = []
// 14X N5 to a lead whose own part is complete: the paid-lead scan (.in on stage2_status) and the lib decision's answer.
let chaserLeads: unknown[] = []
let chaserResult: { outcome: string; error?: string } | null = null
const leadFinalNoticeForOthers = vi.fn(async () => chaserResult)
// N6 retries: the trail's failed N6 rows, and the lib sender they are handed back to.
let failedOutcomes: unknown[] = []
const notifyOutcome = vi.fn(async () => undefined)
// Counsel released N5/N6′ on 2026-10-05; a test re-holds a key here to keep the held path (gap, F2) pinned.
const heldKeys = new Set<string>()
const gapRows: Array<Record<string, unknown>> = []
let trailThrows = false
// Every filter the cron applied, so a scan's bounds are asserted rather than ignored by the stand-in (walker 14x F6).
const calls: Array<{ table: string; m: string; args: unknown[] }> = []
const sendShortlistInvitation = vi.fn(async (): Promise<{ success: boolean; error?: string; logId?: string }> => ({ success: true, logId: "log-1" }))

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: (...a: unknown[]) => captureMessage(...a) }))
vi.mock("@/lib/cron/auth", () => ({ requireCronAuth: () => null }))
vi.mock("@/lib/comms/send-email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...(a as [])),
  fetchOrgSettings: async () => ({}),
  buildBranding: () => ({}),
}))
vi.mock("@/lib/applications/commercial-emails", () => ({ buildDirectorReminderElement: () => null }))
vi.mock("@/lib/applications/emails", () => ({
  sendCoApplicantInvited: (...a: unknown[]) => sendCoApplicantInvited(...(a as [])),
  sendShortlistInvitation: (...a: unknown[]) => sendShortlistInvitation(...(a as [])),
}))
vi.mock("@/lib/screening/notificationTrail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/screening/notificationTrail")>()),
  milestonesSentOk: async () => sentOk,
  recordTrail: async (_db: unknown, row: Record<string, unknown>) => {
    if (trailThrows) throw new Error("trail write failed")
    trailRows.push(row)
  },
  recordGap: async (_db: unknown, row: Record<string, unknown>) => { gapRows.push(row); return true },
}))
vi.mock("@/lib/applications/buildEmailContext", () => ({
  buildEmailContext: async () => ({ appSummary: { firstName: "Primary", lastName: "Contact" }, listingSummary: {}, orgContext: {} }),
}))
vi.mock("@/lib/applications/peerCompletion", () => ({ maybeFireAllGreen: (...a: unknown[]) => maybeFireAllGreen(...a) }))
vi.mock("@/lib/screening/lineFee", () => ({ readLine: async () => ({ ok: true, row: { id: "line-1", paid_at: freshPaidAt } }) }))
vi.mock("@/lib/screening/maybeRunOrchestrator",() => ({ maybeRunOrchestrator: (...a: unknown[]) => maybeRunOrchestrator(...a) }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/comms/template-registry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/comms/template-registry")>()
  return { ...real, heldFor: (key: string) => (heldKeys.has(key) ? "test hold" : real.heldFor(key)) }
})
vi.mock("@/lib/screening/milestoneNotices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/screening/milestoneNotices")>()),
  leadFinalNoticeForOthers: (...a: unknown[]) => leadFinalNoticeForOthers(...(a as [])),
  notifyOutcome: (...a: unknown[]) => notifyOutcome(...(a as [])),
}))
vi.mock("@/lib/routing/absoluteUrl", () => ({ absoluteUrl: (p: string) => `https://app.test${p}` }))

// `leadsQuery`: the cron's lead scan is the only applications read that calls .not(); `one`: a single-row read.
function rowsFor(table: string, leadsQuery: boolean, one: boolean, lapsedQuery = false, chaserQuery = false): unknown {
  if (table === "v_application_screening_lines") return one ? leadLine : [line]
  if (table === "application_co_applicants") return coApp
  if (table === "application_tokens") return liveToken
  if (table === "screening_notification_events") return failedOutcomes
  if (table === "applications" && lapsedQuery) return lapsedLeads
  if (table === "applications" && chaserQuery) return chaserLeads
  if (table === "applications") return leadsQuery ? leads : { first_name: "Primary", last_name: "Contact", applicant_email: "p@test", listings: null,
    entity_type: "organisation", applicant_type: null, company_info: { companyType } }
  return null
}

// A chainable PostgREST stand-in: every filter returns the builder; awaiting it, or calling
// single/maybeSingle, resolves to the table's canned rows. update() records the patch.
function builder(table: string) {
  let leadsQuery = false
  let lapsedQuery = false
  let chaserQuery = false
  const result = (one: boolean) => () => Promise.resolve({ data: rowsFor(table, leadsQuery, one, lapsedQuery, chaserQuery), error: null })
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "limit", "gt", "order"]) b[m] = (...args: unknown[]) => { calls.push({ table, m, args }); return b }
  b.in = (...args: unknown[]) => {
    if (table === "applications" && args[0] === "stage2_status") chaserQuery = true
    calls.push({ table, m: "in", args })
    return b
  }
  b.not = (...args: unknown[]) => { leadsQuery = true; calls.push({ table, m: "not", args }); return b }
  b.lte = (...args: unknown[]) => { lapsedQuery = true; calls.push({ table, m: "lte", args }); return b }
  b.single = result(true)
  b.maybeSingle = result(true)
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result(false)().then(ok, bad)
  b.update = (patch: unknown) => {
    updates.push({ table, patch })
    const done: Record<string, unknown> = {}
    done.eq = () => done
    done.is = () => done
    done.select = async () => ({ data: declinedRows, error: null })
    done.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok)
    return done
  }
  return b
}

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { GET } from "../route"

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const baseCo = {
  applicant_email: "co@test", first_name: "Co", created_at: daysAgo(4), stage2_invited_at: daysAgo(4),
  primary_application_id: "app-1", access_token: "tok",
}
const baseLine = { application_id: "app-1", subject_id: "co-1", subject_name: "Co Party", org_id: "org-1", paid_at: null, expires_at: null, state: "pending_both" }
const run = async () => (await GET({} as NextRequest)).json()

beforeEach(() => {
  sendEmail.mockClear()
  sendCoApplicantInvited.mockClear()
  maybeFireAllGreen.mockClear()
  maybeRunOrchestrator.mockClear()
  captureMessage.mockClear()
  freshPaidAt = null
  declinedRows = [{ id: "co-1" }]
  updates.length = 0
  companyType = "pty_ltd"
  sentOk = new Set()
  trailRows.length = 0
  calls.length = 0
  leads = []
  leadLine = null
  liveToken = { token: "lead-tok" }
  lapsedLeads = []
  chaserLeads = []
  chaserResult = null
  heldKeys.clear()
  leadFinalNoticeForOthers.mockClear()
  failedOutcomes = []
  notifyOutcome.mockClear()
  notifyOutcome.mockImplementation(async () => undefined)
  gapRows.length = 0
  trailThrows = false
  sendShortlistInvitation.mockClear()
  sendEmail.mockImplementation(async () => ({ success: true }))
  sendCoApplicantInvited.mockImplementation(async () => ({ success: true }))
  sendShortlistInvitation.mockImplementation(async () => ({ success: true, logId: "log-1" }))
})

describe("screening-portal-reminders — routed by party_kind (P1-R1 commit 3)", () => {
  it("a residential co-applicant is reminded with co_applicant_invited, never director copy (R5)", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
    expect(sendCoApplicantInvited).toHaveBeenCalledWith(
      expect.objectContaining({ email: "co@test" }), expect.anything(), expect.anything(),
      expect.objectContaining({ accessToken: "tok", resend: expect.objectContaining({ coApplicantId: "co-1" }) }),
    )
    // 14X: nothing is stamped on the party's row any more — the attempt is one trail row.
    expect(updates).toEqual([])
    expect(trailRows).toEqual([expect.objectContaining({
      orgId: "org-1", applicationId: "app-1", subject: { subjectType: "co_applicant", subjectId: "co-1" },
      milestone: "N2", templateKey: "application.co_applicant_invited", sent: { success: true },
    })])
    expect(trailRows[0].deadlineAsStated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("a residential guarantor gets co_applicant_invited, never director copy (R3a)", async () => {
    line = { ...baseLine, party_kind: "guarantor" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "guarantor", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
  })

  it("a residential co-applicant 14 days past its stage-2 invite is declined, told only its N6′, no refund flag (R6)", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.screening_outcome_absent" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates.map((u) => u.table)).toEqual(["application_co_applicants"])
    expect(updates[0].patch).toMatchObject({ decline_reason: "expired_no_completion" })
    expect(maybeFireAllGreen).toHaveBeenCalledWith(expect.anything(), "app-1")
    expect(maybeRunOrchestrator).toHaveBeenCalledWith(expect.anything(), "org-1", "app-1")
  })

  it("KNOWN-GOOD: a declared director surety still gets director copy", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })

  it("a surety who is not a director is reminded like any surety — the hold is released (counsel 2026-10-03)", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })

  it("a surety who CONSENTED but has not paid its own line is not reminded inside the window (no approved pay copy)", async () => {
    line = { ...baseLine, party_kind: "surety", state: "consented_pending_payment" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("14W §0b: …and past its window it is declined like anyone — its own line was never paid", async () => {
    line = { ...baseLine, party_kind: "surety", state: "consented_pending_payment" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(updates[0].patch).toMatchObject({ decline_reason: "expired_no_completion" })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_expired_refund" }))
    expect(maybeRunOrchestrator).toHaveBeenCalledWith(expect.anything(), "org-1", "app-1")
  })

  it("…and past the window a non-director surety expires, rather than sitting held forever", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: daysAgo(15), role: "guarantor", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
  })

  it("14W §0b, ONE CLOCK: a surety CREATED 20 days ago but invited 4 days ago is reminded, not expired", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: daysAgo(4), role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
  })

  it("14W §0b: a surety not yet invited to stage 2 is neither chased nor expired", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: null, role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
  })

  it("PLANTED: a PAID line without consent past the deadline is never declined — flagged for a person", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "paid_pending_consent", paid_at: daysAgo(10) }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  it("PLANTED (walker F3): a consented line that PAID after the run's snapshot is not declined — the fresh read wins", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "consented_pending_payment" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    freshPaidAt = daysAgo(0)
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
  })

  it("PLANTED (walker F6): an overlapping run already declined it — no audit fan-out, no second notice", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "guarantor", is_surety_director: true }
    declinedRows = []
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(maybeRunOrchestrator).not.toHaveBeenCalled()
  })

  it("KNOWN-GOOD twin: the same paid line inside the window is reminded to consent, not flagged", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "paid_pending_consent", paid_at: daysAgo(1) }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it("a surety the applicant DECLARED a director gets director copy without the registry flag (R7a)", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: null, declared_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
  })

  it.each([false, null])("a surety whose declared_director is %s is reminded (released: no and never-asked alike)", async (declared) => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: null, declared_director: declared }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
  })

  it("14W §0b: a surety line in expired_no_consent runs on the same clock — past its window it is declined", async () => {
    // expired_no_consent reads the payment row's expires_at, a settlement field; the deadline is the invite's.
    line = { ...baseLine, party_kind: "surety", state: "expired_no_consent" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
  })

  it("an unknown party_kind is skipped", async () => {
    line = { ...baseLine, party_kind: null }
    coApp = { ...baseCo, role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })
})

describe("a failed send is not recorded as sent (walker F4)", () => {
  it("residential: the milestone stays unstamped when co_applicant_invited reports failure", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false }
    sendCoApplicantInvited.mockResolvedValueOnce({ success: false, error: "rejected" })
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
    // The attempt IS on the trail, as a failure — milestonesSentOk ignores it, so the next run retries.
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N2", sent: { success: false, error: "rejected" } })])
  })
  it("director: the milestone stays unstamped when the reminder reports failure", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: true }
    sendEmail.mockResolvedValueOnce({ success: false, error: "rejected" })
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N2", sent: { success: false, error: "rejected" } })])
  })
})

describe("a trustee's or CC member's 'yes' is reminded — the role-neutral reminder fits every audience (counsel §2)", () => {
  it.each(["trust", "cc"])("%s: declared yes → reminded", async (t) => {
    companyType = t
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: false, declared_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
  })
})

describe("the residential clock runs from the stage-2 invite, never created_at (BUILD_72 P1-R8b-2)", () => {
  it("PLANTED: a party created 20 days ago but never invited to stage 2 is neither chased nor declined", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: null, role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("PLANTED: created 20 days ago, invited 4 days ago → the T+3 reminder, NOT a decline", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(trailRows.map((r) => r.milestone)).toEqual(["N2"])
  })

  it("a stale payment-row expires_at does not end a window the invite has not yet run out", async () => {
    line = { ...baseLine, party_kind: "co_applicant", expires_at: daysAgo(1) }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(2), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
  })

  it("14W §0b: a co who CONSENTED but never paid its OWN line is declined past the window (no lead payment covers it)", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "consented_pending_payment" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(updates[0].patch).toMatchObject({ decline_reason: "expired_no_completion" })
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })

  it("PLANTED: …but is not chased with a consent reminder inside it", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "consented_pending_payment" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("KNOWN-GOOD: invited 13 days ago is still inside the window — not declined (its N5 is due, and sent)", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2", "N4"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(updates).toEqual([])
  })
})

describe("14X: the trail decides what is due (ADDENDUM_14X §2/§3/§5)", () => {
  it("N2 already sent → day 4 sends nothing", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2"])
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(trailRows).toEqual([])
  })

  it("CATCH-UP: nothing sent by day 8 → N4 only, never N2 as well", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(8), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
    expect(trailRows.map((r) => r.milestone)).toEqual(["N4"])
  })

  it("surety at N4: the t7 copy, and the primary contact is told", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(8), role: "guarantor", is_surety_director: true }
    sentOk = new Set(["N2"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t7" }))
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.primary_contact_director_pending" }))
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N4", templateKey: "application.director_reminder_t7" })])
  })

  it("KNOWN-GOOD twin: surety at N2 — the t3 copy, and the primary contact is NOT told", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N2", templateKey: "application.director_reminder_t3" })])
  })

  it("TRANSITIONAL (walker 14x F5): a party stamped {t3} before the trail is not sent N2 again", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "co_applicant", is_surety_director: false, reminder_milestones_sent: { t3: true } }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })

  it("TRANSITIONAL: …nor a surety stamped {t7} sent N4 (and its primary contact told) twice", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(8), role: "guarantor", is_surety_director: true, reminder_milestones_sent: { t3: true, t7: true } }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("day 2 → nothing is due yet", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(2), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(trailRows).toEqual([])
  })
})

describe("14X §7 row 32: the lead is reminded at N2/N4 on its live shortlist token", () => {
  const lead = (over: Record<string, unknown> = {}) => ({ id: "app-L", org_id: "org-1", entity_type: "individual", stage2_invited_at: daysAgo(4), ...over })
  beforeEach(() => {
    line = { ...baseLine, party_kind: null }
    coApp = { ...baseCo, role: "co_applicant", is_surety_director: false }
    leadLine = { state: "pending_both" }
  })

  it("PLANTED (walker 14x F1/F3): the scan is bounded to shortlisted, live leads inside their window, oldest first", async () => {
    await run()
    const scan = calls.filter((c) => c.table === "applications")
    expect(scan).toContainEqual({ table: "applications", m: "eq", args: ["stage2_status", "invited"] })
    expect(scan).toContainEqual({ table: "applications", m: "eq", args: ["stage1_status", "shortlisted"] })
    expect(scan).toContainEqual({ table: "applications", m: "is", args: ["deleted_at", null] })
    const since = scan.find((c) => c.m === "gt" && c.args[0] === "stage2_invited_at")
    expect(since).toBeDefined()
    // The bound is the window: a T0 one window ago, give or take the test's own runtime.
    expect(Math.abs(Date.parse(since!.args[1] as string) - Date.parse(daysAgo(14)))).toBeLessThan(60_000)
    expect(scan).toContainEqual({ table: "applications", m: "order", args: ["stage2_invited_at", { ascending: true }] })
  })

  it("an individual lead at day 4 gets the shortlist email resent, and one trail row as 'applicant'", async () => {
    leads = [lead()]
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    // The approved wording with the days actually LEFT (walker 14x F2): day 4 of 14 → 10, never the full window.
    expect(sendShortlistInvitation).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), { inviteToken: "lead-tok", expiresInDays: 10 })
    expect(trailRows).toEqual([expect.objectContaining({
      applicationId: "app-L", subject: { subjectType: "applicant", subjectId: "app-L" },
      milestone: "N2", templateKey: "application.shortlisted", sent: { success: true, logId: "log-1" },
    })])
  })

  it("a juristic lead is the view's 'company' subject", async () => {
    leads = [lead({ entity_type: "organisation" })]
    await run()
    expect(trailRows[0].subject).toEqual({ subjectType: "company", subjectId: "app-L" })
  })

  it("a lead that consented but has not paid is not chased", async () => {
    leads = [lead()]
    leadLine = { state: "consented_pending_payment" }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendShortlistInvitation).not.toHaveBeenCalled()
  })

  it("a lead whose line is complete is not chased", async () => {
    leads = [lead()]
    leadLine = { state: "complete" }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendShortlistInvitation).not.toHaveBeenCalled()
  })

  it("no live token → flagged for a person, nothing sent, nothing on the trail", async () => {
    leads = [lead()]
    liveToken = null
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendShortlistInvitation).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(trailRows).toEqual([])
  })

  it("a failed resend is on the trail as a failure, and not counted", async () => {
    leads = [lead()]
    sendShortlistInvitation.mockResolvedValueOnce({ success: false, error: "rejected" })
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N2", sent: { success: false, error: "rejected" } })])
  })

  it("TRANSITIONAL (walker 14x F5): a lead the retired nudge already reached is not sent N2 again", async () => {
    leads = [lead({ stage2_reminder_sent_at: daysAgo(1) })]
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendShortlistInvitation).not.toHaveBeenCalled()
  })

  it("past the deadline the lead is not reminded (its outcome at D is P4's)", async () => {
    leads = [lead({ stage2_invited_at: daysAgo(15) })]
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendShortlistInvitation).not.toHaveBeenCalled()
  })
})

describe("14X P4: N5 at D − 24h and N6′ at D — counsel-approved 2026-10-05; a held key records the gap instead", () => {
  const FINAL = "application.screening_final_notice"
  const ABSENT = "application.screening_outcome_absent"
  const lead = (over: Record<string, unknown> = {}) => ({
    id: "app-L", org_id: "org-1", entity_type: "individual", first_name: "Lee", applicant_email: "lee@test",
    stage2_invited_at: daysAgo(13.5), ...over,
  })

  it("a co party inside its last 24 hours gets N5 — counsel's sentence, trailed at its own deadline", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13.5), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2", "N4"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: FINAL, contentHtml: expect.stringContaining("the application will be assessed without your screening information."),
    }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N5", templateKey: FINAL })])
    expect(trailRows[0].deadlineAsStated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(gapRows).toEqual([])
  })

  it("PLANTED: while N5 is HELD, the party gets NO email — one N5 gap, at its own deadline", async () => {
    heldKeys.add(FINAL)
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13.5), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2", "N4"])
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 1 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(gapRows).toEqual([expect.objectContaining({
      applicationId: "app-1", subject: { subjectType: "co_applicant", subjectId: "co-1" }, milestone: "N5", templateKey: FINAL,
    })])
    expect(gapRows[0].deadlineAsStated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("N5 reaches a consented-but-unpaid party too (neutral copy), where N2/N4 do not", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "consented_pending_payment" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13.5), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2", "N4"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(trailRows.map((g) => g.milestone)).toEqual(["N5"])
  })

  it("a surety's N5 is the same notice (no director copy exists for it)", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13.5), role: "guarantor", is_surety_director: true }
    sentOk = new Set(["N2", "N4"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: FINAL }))
  })

  it("KNOWN-GOOD twin: N5 already on the trail → nothing more before D", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13.5), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2", "N4", "N5"])
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(gapRows).toEqual([])
  })

  it("a co_applicant declined at D gets its N6′ — counsel's sentence, no link; the decline stands", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: ABSENT, contentHtml: expect.stringContaining("The application will be assessed without your screening information."),
    }))
    expect(sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ contentHtml: expect.stringMatching(/href/) }))
    expect(updates[0].patch).toMatchObject({ decline_reason: "expired_no_completion" })
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N6_absent", templateKey: ABSENT })])
  })

  it("while N6′ is HELD, a declined co party gets a gap and no email; the decline stands", async () => {
    heldKeys.add(ABSENT)
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(gapRows).toEqual([expect.objectContaining({ milestone: "N6_absent", templateKey: ABSENT })])
  })

  it("an overlapping run that already declined it records no second N6′ (walker F6)", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    declinedRows = []
    await run()
    expect(gapRows).toEqual([])
  })

  it("PLANTED (walker 14x-p4 F2): while N5 is held, an N4 still owed in the last 24h is SENT — the gap is recorded too", async () => {
    heldKeys.add(FINAL)
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13.5), role: "co_applicant", is_surety_director: false }
    sentOk = new Set(["N2"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N4" })])
    expect(gapRows.map((g) => g.milestone)).toEqual(["N5"])
  })

  it("PLANTED (walker 14x-p4 F1): a surety notice whose trail write fails still leaves the fan-out and the orchestrator to run", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "guarantor", is_surety_director: true }
    trailThrows = true
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(maybeFireAllGreen).toHaveBeenCalledWith(expect.anything(), "app-1")
    expect(maybeRunOrchestrator).toHaveBeenCalledWith(expect.anything(), "org-1", "app-1")
  })

  it("a surety's N6′ is the APPROVED expiry notice, sent and now on the trail", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(15), role: "guarantor", is_surety_director: true }
    sendEmail.mockResolvedValueOnce({ success: true })
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_expired_refund" }))
    expect(trailRows).toEqual([expect.objectContaining({ milestone: "N6_absent", templateKey: "application.director_expired_refund" })])
    expect(gapRows).toEqual([])
  })

  it("the lead in its last 24 hours: N5 sent as the lead's own subject, in the lead's variant", async () => {
    line = { ...baseLine, party_kind: null }
    coApp = { ...baseCo, role: "co_applicant", is_surety_director: false }
    leads = [lead()]
    leadLine = { state: "consented_pending_payment" }
    sentOk = new Set(["N2", "N4"])
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendShortlistInvitation).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: FINAL, to: expect.objectContaining({ email: "lee@test" }),
      contentHtml: expect.stringContaining("the application cannot be assessed."),
    }))
    expect(trailRows).toEqual([expect.objectContaining({ subject: { subjectType: "applicant", subjectId: "app-L" }, milestone: "N5" })])
  })

  it("a lead whose own part is complete: the chaser N5 from its own scan, held → counted as held", async () => {
    chaserLeads = [lead()]
    chaserResult = { outcome: "held" }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 1 })
    expect(calls).toContainEqual({ table: "applications", m: "in", args: ["stage2_status", ["screening_in_progress", "screening_complete"]] })
    expect(leadFinalNoticeForOthers).toHaveBeenCalledWith(expect.anything(), { orgId: "org-1", applicationId: "app-L" })
  })

  it("KNOWN-GOOD twins: the chaser is skipped once the lead's N5 is on the trail, and nothing counts when none is due", async () => {
    chaserLeads = [lead()]
    chaserResult = { outcome: "sent" }
    sentOk = new Set(["N5"])
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(leadFinalNoticeForOthers).not.toHaveBeenCalled()
    sentOk = new Set()
    chaserResult = null
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
  })

  it("N6 retry: each application with a failed N6 row inside one window is offered to notifyOutcome once", async () => {
    failedOutcomes = [
      { org_id: "org-1", application_id: "app-A" }, { org_id: "org-1", application_id: "app-A" },
      { org_id: "org-2", application_id: "app-B" },
    ]
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(notifyOutcome.mock.calls).toEqual([
      [expect.anything(), { orgId: "org-1", applicationId: "app-A" }],
      [expect.anything(), { orgId: "org-2", applicationId: "app-B" }],
    ])
    expect(calls).toContainEqual({ table: "screening_notification_events", m: "eq", args: ["send_ok", false] })
    expect(calls).toContainEqual({ table: "screening_notification_events", m: "eq", args: ["milestone", "N6"] })
    expect(calls.some((c) => c.table === "screening_notification_events" && c.m === "gt" && c.args[0] === "created_at")).toBe(true)
  })

  it("N6 retry: one application throwing does not stop the next, and nothing is offered with no failures", async () => {
    notifyOutcome.mockImplementationOnce(async () => { throw new Error("roster read failed") })
    failedOutcomes = [{ org_id: "org-1", application_id: "app-A" }, { org_id: "org-1", application_id: "app-C" }]
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(notifyOutcome).toHaveBeenCalledTimes(2)
    notifyOutcome.mockClear()
    failedOutcomes = []
    await run()
    expect(notifyOutcome).not.toHaveBeenCalled()
  })

  it("a failed chaser is reported and the run still answers ok", async () => {
    chaserLeads = [lead()]
    chaserResult = { outcome: "failed", error: "provider down" }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
  })

  it("PLANTED: the lapsed-lead scan is bounded — past its own D, within the grace, shortlisted and live", async () => {
    await run()
    const scan = calls.filter((c) => c.table === "applications")
    const upper = scan.find((c) => c.m === "lte" && c.args[0] === "stage2_invited_at")
    expect(upper).toBeDefined()
    expect(Math.abs(Date.parse(upper!.args[1] as string) - Date.parse(daysAgo(14)))).toBeLessThan(60_000)
    const lowers = scan.filter((c) => c.m === "gt" && c.args[0] === "stage2_invited_at").map((c) => Date.parse(c.args[1] as string))
    expect(lowers.some((t) => Math.abs(t - Date.parse(daysAgo(28))) < 60_000)).toBe(true)
  })

  it("the lapsed-lead scan reads newest first, so a full page is the leads still owed N6′ (walker 14x-p4 F7)", async () => {
    await run()
    expect(calls).toContainEqual({ table: "applications", m: "order", args: ["stage2_invited_at", { ascending: false }] })
  })

  it("a lead past its D with its part incomplete gets N6′ in the lead's variant, trailed as the lead", async () => {
    line = { ...baseLine, party_kind: null }
    lapsedLeads = [lead({ stage2_invited_at: daysAgo(15) })]
    leadLine = { state: "pending_both" }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: ABSENT, contentHtml: expect.stringContaining("Without your part, the application could not be assessed."),
    }))
    expect(trailRows).toEqual([expect.objectContaining({
      subject: { subjectType: "applicant", subjectId: "app-L" }, milestone: "N6_absent", templateKey: ABSENT,
    })])
    expect(updates).toEqual([])
  })

  it("KNOWN-GOOD twins: a lead past D whose part is complete, or whose N6′ is already sent, is told nothing", async () => {
    line = { ...baseLine, party_kind: null }
    lapsedLeads = [lead({ stage2_invited_at: daysAgo(15) })]
    leadLine = { state: "complete" }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    leadLine = { state: "pending_both" }
    sentOk = new Set(["N6_absent"])
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(gapRows).toEqual([])
  })
})
