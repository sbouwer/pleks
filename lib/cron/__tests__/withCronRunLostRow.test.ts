/**
 * lib/cron/__tests__/withCronRunLostRow.test.ts — a cron_runs row that was not written is reported, not swallowed
 *
 * Notes:  postgrest-js RETURNS its errors, fetch rejections included, so until 2026-09-14 the insert's failure
 *         reached neither the catch nor the log (walker F1). The digest grades from these rows, so a lost row
 *         makes a job read healthier than it is. Probed both ways, plus the invariant that recording never
 *         changes the cron's own response.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const captureMessage = vi.fn()
let insertResult: () => Promise<{ error: { message: string } | null }> = async () => ({ error: null })

vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a), captureException: vi.fn() }))
vi.mock("../auth", () => ({ isCronAuthorised: () => true }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ from: () => ({ insert: () => insertResult() }) }),
}))

import { withCronRun } from "../withCronRun"

const req = {} as NextRequest
const handler = async () => Response.json({ ok: true, processed: 4 })

beforeEach(() => {
  captureMessage.mockClear()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("withCronRun — a lost cron_runs row", () => {
  it("a RETURNED insert error is reported, and the cron's response is untouched", async () => {
    insertResult = async () => ({ error: { message: "Gateway Timeout" } })
    const res = await withCronRun("screening_line_runner", handler)(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, processed: 4 })
    expect(captureMessage).toHaveBeenCalledWith("cron_runs row not written", expect.objectContaining({
      tags: { cron_job: "screening_line_runner", kind: "cron_runs_lost" },
      extra: { runStatus: "completed", message: "Gateway Timeout" },
    }))
  })

  it("a THROWN insert is reported the same way", async () => {
    insertResult = async () => { throw new Error("fetch failed") }
    await withCronRun("j", handler)(req)
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  it("a written row reports nothing", async () => {
    insertResult = async () => ({ error: null })
    await withCronRun("j", handler)(req)
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
