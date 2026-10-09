/**
 * lib/screening/__tests__/settleErasedCoLine.test.ts — an erased co party's line leaves the set once, and only if erased
 *
 * Notes:  Both directions. The update is guarded on the undeclined AND erased halves, so a live party can never be
 *         declined through it; a settle that matched nothing (already settled, or not erased) owes no audit row and no
 *         follow-on. A paid line is raised to a person, never refunded here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { REDACTED } from "@/lib/popia/anonymisePlan"

const captureMessage = vi.fn()
const recordAudit = vi.fn()
const maybeFireAllGreen = vi.fn()
const maybeRunOrchestrator = vi.fn()
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }))
vi.mock("@/lib/applications/peerCompletion", () => ({ maybeFireAllGreen: (...a: unknown[]) => maybeFireAllGreen(...a) }))
vi.mock("@/lib/screening/maybeRunOrchestrator", () => ({ maybeRunOrchestrator: (...a: unknown[]) => maybeRunOrchestrator(...a) }))

import { settleErasedCoLine } from "../settleErasedCoLine"

/** Records the update's patch and filters; `matched` is what the guarded update returns. */
function fakeDb(matched: unknown[] | "error") {
  const seen: { patch?: Record<string, unknown>; filters: Array<[string, string, unknown]> } = { filters: [] }
  const chain: Record<string, unknown> = {}
  chain.eq = (c: string, v: unknown) => { seen.filters.push(["eq", c, v]); return chain }
  chain.is = (c: string, v: unknown) => { seen.filters.push(["is", c, v]); return chain }
  chain.select = async () => matched === "error" ? { data: null, error: { message: "boom" } } : { data: matched, error: null }
  const db = { from: () => ({ update: (patch: Record<string, unknown>) => { seen.patch = patch; return chain } }) }
  return { db: db as unknown as SupabaseClient, seen }
}

const LINE = { org_id: "org-1", application_id: "app-1", subject_id: "co-1", paid: false }

beforeEach(() => { for (const f of [captureMessage, recordAudit, maybeFireAllGreen, maybeRunOrchestrator]) f.mockClear() })

describe("settleErasedCoLine", () => {
  it("declines only an undeclined, ERASED row of this org — and offers the roster follow-ons", async () => {
    const { db, seen } = fakeDb([{ id: "co-1" }])
    expect(await settleErasedCoLine(db, LINE)).toBe(true)
    expect(seen.patch).toMatchObject({ decline_reason: "subject_erased" })
    expect(seen.filters).toEqual(expect.arrayContaining([
      ["eq", "id", "co-1"], ["eq", "org_id", "org-1"], ["is", "declined_at", null], ["eq", "applicant_email", REDACTED],
    ]))
    expect(recordAudit).toHaveBeenCalledWith(db, expect.objectContaining({ recordId: "co-1", after: expect.objectContaining({ decline_reason: "subject_erased" }) }))
    expect(maybeFireAllGreen).toHaveBeenCalledWith(db, "app-1")
    expect(maybeRunOrchestrator).toHaveBeenCalledWith(db, "org-1", "app-1")
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it("PLANTED: a paid line is raised to a person", async () => {
    await settleErasedCoLine(fakeDb([{ id: "co-1" }]).db, { ...LINE, paid: true })
    expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining("refund decision for a person"), expect.anything())
  })

  it("a settle that matched nothing (already settled, or not erased) audits nothing and offers nothing", async () => {
    expect(await settleErasedCoLine(fakeDb([]).db, { ...LINE, paid: true })).toBe(false)
    for (const f of [recordAudit, maybeFireAllGreen, maybeRunOrchestrator, captureMessage]) expect(f).not.toHaveBeenCalled()
  })

  it("a failed write throws — the caller's catch reports it, and the line is still there to settle next run", async () => {
    await expect(settleErasedCoLine(fakeDb("error").db, LINE)).rejects.toThrow(/boom/)
    expect(maybeRunOrchestrator).not.toHaveBeenCalled()
  })
})
