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
 *         · a send that reports failure leaves the milestone UNSTAMPED, so the next run retries it (walker F4).
 *         14W §0b, ONE CLOCK: a surety's window runs from its own stage2_invited_at too (it is invited at shortlist now);
 *         a party that consented but has not paid its own line is declined at the deadline like anyone, never chased;
 *         a PAID line without consent is never declined (flagged instead); and every decline offers the application to
 *         the FitScore orchestrator, since the set it leaves may now be complete.
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

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: (...a: unknown[]) => captureMessage(...a) }))
vi.mock("@/lib/cron/auth", () => ({ requireCronAuth: () => null }))
vi.mock("@/lib/comms/send-email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...(a as [])),
  fetchOrgSettings: async () => ({}),
  buildBranding: () => ({}),
}))
vi.mock("@/lib/applications/commercial-emails", () => ({ buildDirectorReminderElement: () => null }))
vi.mock("@/lib/applications/emails", () => ({ sendCoApplicantInvited: (...a: unknown[]) => sendCoApplicantInvited(...(a as [])) }))
vi.mock("@/lib/applications/buildEmailContext", () => ({
  buildEmailContext: async () => ({ appSummary: { firstName: "Primary", lastName: "Contact" }, listingSummary: {}, orgContext: {} }),
}))
vi.mock("@/lib/applications/peerCompletion", () => ({ maybeFireAllGreen: (...a: unknown[]) => maybeFireAllGreen(...a) }))
vi.mock("@/lib/screening/lineFee", () => ({ readLine: async () => ({ ok: true, row: { id: "line-1", paid_at: freshPaidAt } }) }))
vi.mock("@/lib/screening/maybeRunOrchestrator",() => ({ maybeRunOrchestrator: (...a: unknown[]) => maybeRunOrchestrator(...a) }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/routing/absoluteUrl", () => ({ absoluteUrl: (p: string) => `https://app.test${p}` }))

function rowsFor(table: string): unknown {
  if (table === "v_application_screening_lines") return [line]
  if (table === "application_co_applicants") return coApp
  if (table === "applications") return { first_name: "Primary", last_name: "Contact", applicant_email: "p@test", listings: null,
    entity_type: "organisation", applicant_type: null, company_info: { companyType } }
  return null
}

// A chainable PostgREST stand-in: every filter returns the builder; awaiting it, or calling
// single/maybeSingle, resolves to the table's canned rows. update() records the patch.
function builder(table: string) {
  const result = () => Promise.resolve({ data: rowsFor(table), error: null })
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "limit"]) b[m] = () => b
  b.single = result
  b.maybeSingle = result
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
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
  primary_application_id: "app-1", access_token: "tok", reminder_milestones_sent: {},
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
    expect(updates).toEqual([{ table: "application_co_applicants", patch: { reminder_milestones_sent: { t3: true } } }])
  })

  it("a residential guarantor gets co_applicant_invited, never director copy (R3a)", async () => {
    line = { ...baseLine, party_kind: "guarantor" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(4), role: "guarantor", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
  })

  it("a residential co-applicant 14 days past its stage-2 invite is declined, with no email and no refund flag (R6)", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, created_at: daysAgo(20), stage2_invited_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
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
  })
  it("director: the milestone stays unstamped when the reminder reports failure", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: true }
    sendEmail.mockResolvedValueOnce({ success: false, error: "rejected" })
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
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
    expect(updates).toEqual([{ table: "application_co_applicants", patch: { reminder_milestones_sent: { t3: true } } }])
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

  it("KNOWN-GOOD: invited 13 days ago is still inside the window", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, stage2_invited_at: daysAgo(13), role: "co_applicant", is_surety_director: false, reminder_milestones_sent: { t3: true, t7: true, t10: true } }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
  })
})
