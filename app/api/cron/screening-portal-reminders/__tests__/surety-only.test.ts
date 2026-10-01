/**
 * app/api/cron/screening-portal-reminders/__tests__/surety-only.test.ts — director copy reaches surety parties only
 *
 * Notes:  BUILD_72 P1-R1 (census build-72-p1 row 29): the view lists every live co-applicant as a line, and
 *         this cron sends the director-portal link and director copy. Probed both ways — a residential joint
 *         co-applicant gets nothing, and each surety marker on its own still gets its reminder — so a
 *         predicate that skipped everything would fail here too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

const sendEmail = vi.fn(async () => ({ ok: true }))
let coApp: Record<string, unknown> = {}
const updates: Array<{ table: string; patch: unknown }> = []

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
vi.mock("@/lib/cron/auth", () => ({ requireCronAuth: () => null }))
vi.mock("@/lib/comms/send-email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...(a as [])),
  fetchOrgSettings: async () => ({}),
  buildBranding: () => ({}),
}))
vi.mock("@/lib/applications/commercial-emails", () => ({ buildDirectorReminderElement: () => null }))
vi.mock("@/lib/applications/peerCompletion", () => ({ maybeFireAllGreen: vi.fn() }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/routing/absoluteUrl", () => ({ absoluteUrl: (p: string) => `https://app.test${p}` }))

function rowsFor(table: string): unknown {
  if (table === "v_application_screening_lines") {
    return [{ application_id: "app-1", subject_id: "co-1", subject_name: "Co Party", org_id: "org-1", paid_at: null }]
  }
  if (table === "application_co_applicants") return coApp
  if (table === "applications") return { first_name: "Primary", last_name: "Contact", applicant_email: "p@test", listings: null }
  return null
}

// A chainable PostgREST stand-in: every filter returns the builder; awaiting it, or calling
// single/maybeSingle, resolves to the table's canned rows.
function builder(table: string) {
  const result = () => Promise.resolve({ data: rowsFor(table), error: null })
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "limit"]) b[m] = () => b
  b.single = result
  b.maybeSingle = result
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
  b.update = (patch: unknown) => {
    updates.push({ table, patch })
    return { eq: () => Promise.resolve({ error: null }) }
  }
  return b
}

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { GET } from "../route"

const FOUR_DAYS_AGO = new Date(Date.now() - 4 * 86_400_000).toISOString()
const base = {
  applicant_email: "co@test", first_name: "Co", created_at: FOUR_DAYS_AGO,
  primary_application_id: "app-1", access_token: "tok", reminder_milestones_sent: {},
}

beforeEach(() => {
  sendEmail.mockClear()
  updates.length = 0
})

describe("screening-portal-reminders — surety parties only (P1-R1)", () => {
  it("a residential joint co-applicant receives no director copy and is not marked reminded", async () => {
    coApp = { ...base, role: "co_applicant", is_surety_director: null }
    const res = await GET({} as NextRequest)
    expect(await res.json()).toEqual({ ok: true, reminders: 0, expirations: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("a roster guarantor (role marker only) is reminded", async () => {
    coApp = { ...base, role: "guarantor", is_surety_director: null }
    const res = await GET({} as NextRequest)
    expect(await res.json()).toEqual({ ok: true, reminders: 1, expirations: 0 })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "application.director_reminder_t3" }))
  })

  it("a declared surety director (flag marker only) is reminded", async () => {
    coApp = { ...base, role: null, is_surety_director: true }
    const res = await GET({} as NextRequest)
    expect(await res.json()).toEqual({ ok: true, reminders: 1, expirations: 0 })
  })
})
