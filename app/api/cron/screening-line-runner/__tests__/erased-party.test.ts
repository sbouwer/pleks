/**
 * app/api/cron/screening-line-runner/__tests__/erased-party.test.ts — an erased co party's paid line is settled, never run
 *
 * Notes:  N3 re-walk R1b. Before this, a paid + consented co who exercised erasure was claimed and screened: the strip had
 *         taken its ID number, so the bundle threw, the line went `failed` for a person, and nothing ever offered the
 *         FitScore orchestrator the application again. Planted: the erased party is settled through the shared helper and
 *         nothing is claimed or bought. Known-good: a live co party is still claimed and run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"
import { ANONYMISE_PLAN } from "@/lib/popia/anonymisePlan"

const runStandardBundle = vi.fn(async () => ({ screeningRunId: "run-1" }))
const settleErasedCoLine = vi.fn(async () => true)
const updates: Array<{ table: string; patch: unknown }> = []
let party: Record<string, unknown> | null = null
let claimFails = false

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/cron/withCronRun", () => ({ withCronRun: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/screening/sweepStrandedClaims", () => ({ sweepStrandedClaims: async () => 0 }))
vi.mock("@/lib/screening/bundle-runner", () => ({ runStandardBundle: (...a: unknown[]) => runStandardBundle(...(a as [])) }))
vi.mock("@/lib/screening/settleErasedCoLine", () => ({ settleErasedCoLine: (...a: unknown[]) => settleErasedCoLine(...(a as [])) }))
vi.mock("@/lib/screening/maybeRunOrchestrator", () => ({ maybeRunOrchestrator: vi.fn() }))
vi.mock("@/lib/screening/completeSubject", () => ({ completeSubject: vi.fn() }))
vi.mock("@/lib/screening/refundOwed", () => ({ recordOwedRefund: vi.fn() }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))

const LINE = { application_id: "app-1", subject_type: "co_applicant", subject_id: "co-1", subject_name: "Co", org_id: "org-1" }

/** The view returns one ready line; a co read returns `party`; a claim returns no row, so a live run stops after it. */
function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "limit", "is", "order"]) b[m] = () => b
  b.maybeSingle = async () => ({ data: table === "application_co_applicants" ? party : null, error: null })
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "v_application_screening_lines" ? [LINE] : [], error: null }).then(ok)
  b.update = (patch: unknown) => {
    updates.push({ table, patch })
    const done: Record<string, unknown> = {}
    for (const m of ["eq", "in", "is"]) done[m] = () => done
    done.select = async () => (claimFails ? { data: null, error: { message: "boom" } } : { data: [], error: null })
    return done
  }
  return b
}
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: (t: string) => builder(t) }) }))

import { GET } from "../route"

const run = async () => (await GET({} as NextRequest)).json()

beforeEach(() => {
  runStandardBundle.mockClear()
  settleErasedCoLine.mockClear()
  updates.length = 0
  claimFails = false
})

describe("screening-line-runner — an erased co party (N3 re-walk R1b)", () => {
  it("PLANTED: its paid line is settled through the shared helper — never claimed, never screened", async () => {
    party = { applicant_email: "co@test", declined_at: null, ...ANONYMISE_PLAN.find((g) => g.id === "C.application_co_applicants.self")!.fields }
    expect(await run()).toMatchObject({ ok: true, processed: 1, failed: 0 })
    expect(settleErasedCoLine).toHaveBeenCalledWith(expect.anything(), { org_id: "org-1", application_id: "app-1", subject_id: "co-1", paid: true })
    expect(updates).toEqual([])
    expect(runStandardBundle).not.toHaveBeenCalled()
  })

  it("KNOWN-GOOD: a live co party is claimed as before, and the helper is not called", async () => {
    party = { applicant_email: "co@test", declined_at: null }
    await run()
    expect(settleErasedCoLine).not.toHaveBeenCalled()
    expect(updates).toEqual([{ table: "application_co_applicants", patch: expect.objectContaining({ searchworx_check_status: "running" }) }])
  })

  it("a co line that FAILS is offered to the settle — the helper's erased guard decides, so `failed` never strands one (n3b walker F2)", async () => {
    party = { applicant_email: "co@test", declined_at: null }
    claimFails = true
    expect(await run()).toMatchObject({ failed: 1 })
    expect(settleErasedCoLine).toHaveBeenCalledWith(expect.anything(), { org_id: "org-1", application_id: "app-1", subject_id: "co-1", paid: true })
  })

  it("a rejecting settle after a failure never breaks the batch", async () => {
    party = { applicant_email: "co@test", declined_at: null }
    claimFails = true
    settleErasedCoLine.mockImplementationOnce(async () => { throw new Error("settle boom") })
    expect(await run()).toMatchObject({ ok: true, failed: 1 })
  })
})
