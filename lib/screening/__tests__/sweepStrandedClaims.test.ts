/**
 * lib/screening/__tests__/sweepStrandedClaims.test.ts — a swept co row is offered to the erased-line settle
 *
 * Notes:  n3b walker W2. A co erased while its run died is swept to `failed`, a state no queue re-reads, so the sweep
 *         offers every swept co row to settleErasedCoLine — whose own guard decides whether it was erased. A lead row
 *         is never offered (it has no co line), and a rejecting settle never stops the sweep.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { createServiceClient } from "@/lib/supabase/server"

const settleErasedCoLine = vi.fn(async () => true)
const captureException = vi.fn()
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a), captureMessage: vi.fn() }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/screening/settleErasedCoLine", () => ({ settleErasedCoLine: (...a: unknown[]) => settleErasedCoLine(...(a as [])) }))

import { sweepStrandedClaims } from "../sweepStrandedClaims"

type Svc = Awaited<ReturnType<typeof createServiceClient>>

/** Each table's sweep returns one stranded row; the co row names its application. */
function fakeService(): Svc {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {}
      for (const m of ["update", "eq", "lt"]) b[m] = () => b
      b.select = async () => ({
        data: [table === "applications" ? { id: "app-9", org_id: "org-1" } : { id: "co-1", org_id: "org-1", primary_application_id: "app-1" }],
        error: null,
      })
      return b
    },
  } as unknown as Svc
}

beforeEach(() => { settleErasedCoLine.mockClear(); captureException.mockClear() })

describe("sweepStrandedClaims — erased co rows (n3b walker W2)", () => {
  it("offers the swept co row to the settle, and never the lead row", async () => {
    expect(await sweepStrandedClaims(fakeService())).toBe(2)
    expect(settleErasedCoLine).toHaveBeenCalledTimes(1)
    expect(settleErasedCoLine).toHaveBeenCalledWith(expect.anything(), { org_id: "org-1", application_id: "app-1", subject_id: "co-1", paid: true })
  })

  it("a rejecting settle is reported and the sweep still completes", async () => {
    settleErasedCoLine.mockImplementationOnce(async () => { throw new Error("settle boom") })
    expect(await sweepStrandedClaims(fakeService())).toBe(2)
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tags: { reason: "erased_settle_failed" } }))
  })
})
