/**
 * lib/screening/__tests__/maybeRunOrchestrator.test.ts — N6 is offered only after a successful run, and never breaks the caller
 *
 * Notes:  ADDENDUM_14X N6 (walker 14x-p4b F6). The orchestrator runs only when the lead and every live co party are
 *         complete; notifyOutcome follows ONLY an ok run, and its rejection is swallowed — the deadline decline that
 *         calls this has already committed its own write and must not lose what follows to a notice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { createServiceClient } from "@/lib/supabase/server"

let orchResult: { ok: boolean; reason?: string } = { ok: true }
const runFitScoreOrchestrator = vi.fn(async () => orchResult)
const notifyOutcome = vi.fn(async () => undefined)
vi.mock("@/lib/env", () => ({ optionalEnv: () => "1" }))
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/screening/fitScoreOrchestrator", () => ({
  runFitScoreOrchestrator: (...a: unknown[]) => runFitScoreOrchestrator(...(a as [])),
}))
vi.mock("@/lib/screening/milestoneNotices", () => ({ notifyOutcome: (...a: unknown[]) => notifyOutcome(...(a as [])) }))

import { maybeRunOrchestrator } from "../maybeRunOrchestrator"

type Svc = Awaited<ReturnType<typeof createServiceClient>>

/** The lead's status and the live co rows' statuses. */
function fakeService(lead: string, cos: string[]): Svc {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {}
      for (const m of ["select", "eq", "is"]) b[m] = () => b
      b.maybeSingle = async () => ({ data: { searchworx_check_status: lead }, error: null })
      if (table === "application_co_applicants") {
        b.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: cos.map((s) => ({ searchworx_check_status: s })), error: null }).then(ok)
      }
      return b
    },
  } as unknown as Svc
}

beforeEach(() => {
  orchResult = { ok: true }
  runFitScoreOrchestrator.mockClear()
  notifyOutcome.mockClear()
  notifyOutcome.mockImplementation(async () => undefined)
})

describe("N6 follows the run (14X §2)", () => {
  it("an ok run offers N6 for that org and application", async () => {
    await maybeRunOrchestrator(fakeService("complete", ["complete"]), "org-A", "app-1")
    expect(notifyOutcome).toHaveBeenCalledWith(expect.anything(), { orgId: "org-A", applicationId: "app-1" })
  })

  it("PLANTED: a failed run sends no N6", async () => {
    orchResult = { ok: false, reason: "consent" }
    await maybeRunOrchestrator(fakeService("complete", []), "org-A", "app-1")
    expect(runFitScoreOrchestrator).toHaveBeenCalled()
    expect(notifyOutcome).not.toHaveBeenCalled()
  })

  it("PLANTED: a live party still outstanding means no run and no N6", async () => {
    await maybeRunOrchestrator(fakeService("complete", ["complete", "pending"]), "org-A", "app-1")
    await maybeRunOrchestrator(fakeService("pending", []), "org-A", "app-1")
    expect(runFitScoreOrchestrator).not.toHaveBeenCalled()
    expect(notifyOutcome).not.toHaveBeenCalled()
  })

  it("a rejecting notifyOutcome never reaches the caller", async () => {
    notifyOutcome.mockImplementationOnce(async () => { throw new Error("roster read failed") })
    await expect(maybeRunOrchestrator(fakeService("complete", []), "org-A", "app-1")).resolves.toBeUndefined()
  })
})
