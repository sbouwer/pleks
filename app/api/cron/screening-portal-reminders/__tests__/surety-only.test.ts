/**
 * app/api/cron/screening-portal-reminders/__tests__/surety-only.test.ts — reminder copy is routed by party_kind
 *
 * Notes:  BUILD_72 P1-R1 (census build-72-p1 row 29) + P1-R3/R5/R6. The view lists every live co-applicant as a
 *         line; this cron used to send every one of them director copy. Probed both ways per branch:
 *         · a residential co-applicant gets `co_applicant_invited` verbatim, never director copy (R5), and is
 *           declined past expires_at with the payment row untouched — the refund branch is gated (R6);
 *         · a declared director surety still gets director copy, so a router that sent nothing would fail;
 *         · a surety who is not a declared director is HELD — no send, no decline (R3);
 *         · an unknown party_kind is skipped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

const sendEmail = vi.fn(async () => ({ ok: true }))
const sendCoApplicantInvited = vi.fn(async () => ({ ok: true }))
const maybeFireAllGreen = vi.fn()
let coApp: Record<string, unknown> = {}
let line: Record<string, unknown> = {}
const updates: Array<{ table: string; patch: unknown }> = []

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
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
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/routing/absoluteUrl", () => ({ absoluteUrl: (p: string) => `https://app.test${p}` }))

function rowsFor(table: string): unknown {
  if (table === "v_application_screening_lines") return [line]
  if (table === "application_co_applicants") return coApp
  if (table === "applications") return { first_name: "Primary", last_name: "Contact", applicant_email: "p@test", listings: null }
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
    done.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok)
    return done
  }
  return b
}

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { GET } from "../route"

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const baseCo = {
  applicant_email: "co@test", first_name: "Co", created_at: daysAgo(4),
  primary_application_id: "app-1", access_token: "tok", reminder_milestones_sent: {},
}
const baseLine = { application_id: "app-1", subject_id: "co-1", subject_name: "Co Party", org_id: "org-1", paid_at: null, expires_at: null, state: "pending_both" }
const run = async () => (await GET({} as NextRequest)).json()

beforeEach(() => {
  sendEmail.mockClear()
  sendCoApplicantInvited.mockClear()
  maybeFireAllGreen.mockClear()
  updates.length = 0
})

describe("screening-portal-reminders — routed by party_kind (P1-R1 commit 3)", () => {
  it("a residential co-applicant is reminded with co_applicant_invited, never director copy (R5)", async () => {
    line = { ...baseLine, party_kind: "co_applicant" }
    coApp = { ...baseCo, role: "co_applicant", is_surety_director: false }
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
    coApp = { ...baseCo, role: "guarantor", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).toHaveBeenCalledTimes(1)
  })

  it("a residential co-applicant past expires_at is declined, with no email and no refund flag (R6)", async () => {
    line = { ...baseLine, party_kind: "co_applicant", state: "expired_no_consent", paid_at: daysAgo(10), expires_at: daysAgo(1) }
    coApp = { ...baseCo, created_at: daysAgo(15), role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 1, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates.map((u) => u.table)).toEqual(["application_co_applicants"])
    expect(updates[0].patch).toMatchObject({ decline_reason: "expired_no_completion" })
    expect(maybeFireAllGreen).toHaveBeenCalledWith(expect.anything(), "app-1")
  })

  it("KNOWN-GOOD: a declared director surety still gets director copy", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 1, expirations: 0, held: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })

  it("a surety who is not a declared director is HELD: no send, no update (R3)", async () => {
    line = { ...baseLine, party_kind: "surety" }
    coApp = { ...baseCo, created_at: daysAgo(20), role: "guarantor", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 1 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("a director line in expired_no_consent keeps its old treatment — not selected before, skipped now", async () => {
    line = { ...baseLine, party_kind: "surety", state: "expired_no_consent" }
    coApp = { ...baseCo, created_at: daysAgo(20), role: "guarantor", is_surety_director: true }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(updates).toEqual([])
  })

  it("an unknown party_kind is skipped", async () => {
    line = { ...baseLine, party_kind: null }
    coApp = { ...baseCo, role: "co_applicant", is_surety_director: false }
    expect(await run()).toEqual({ ok: true, reminders: 0, expirations: 0, held: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendCoApplicantInvited).not.toHaveBeenCalled()
  })
})
