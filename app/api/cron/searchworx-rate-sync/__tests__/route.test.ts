/**
 * app/api/cron/searchworx-rate-sync/__tests__/route.test.ts — the cron route's own rules: auth, ?date= backfill, cron_runs
 *
 * Notes:  runRateSync is mocked — its rules are sync.test.ts's. Probed both ways: a malformed or future date is
 *         400 and runs nothing; today and a past day are passed through as the billing day; no date means
 *         yesterday (billingDay undefined); the cron_runs row carries the "held" count in its metadata.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

let authed = true
const runs: Record<string, unknown>[] = []
const calls: { billingDay?: string; today: string }[] = []

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock("@/lib/cron/auth", () => ({
  requireCronAuth: () => (authed ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 })),
}))
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), saTodayISO: () => "2026-10-01" }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: () => ({
      insert: async (r: Record<string, unknown>) => (runs.push({ ...r }), { error: null }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => (Object.assign(runs.at(-1)!, patch), { error: null }) }),
    }),
  }),
}))
vi.mock("@/lib/searchworx/rates/sync", () => ({
  runRateSync: async (_db: unknown, deps: { billingDay?: string; today: string }) => {
    calls.push({ billingDay: deps.billingDay, today: deps.today })
    return { billingDay: deps.billingDay ?? "2026-09-30", sourceFailure: null, alerts: [], summary: { recorded: 0, held: 2, held_new: 0 } }
  },
}))

import { GET } from "../route"

const get = (qs = "") => GET(new NextRequest(`https://x/api/cron/searchworx-rate-sync${qs}`))

beforeEach(() => {
  authed = true
  runs.length = 0
  calls.length = 0
})

describe("GET /api/cron/searchworx-rate-sync", () => {
  it("no date → yesterday (billingDay left to the sync), and 'held' lands in cron_runs metadata", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(calls).toEqual([{ billingDay: undefined, today: "2026-10-01" }])
    expect(runs[0]).toMatchObject({ job_name: "searchworx-rate-sync", status: "completed", metadata: { billing_day: "2026-09-30", held: 2, held_new: 0 } })
  })

  it("KNOWN-GOOD: a past day and today are both passed through as the billing day", async () => {
    expect((await get("?date=2026-09-15")).status).toBe(200)
    expect((await get("?date=2026-10-01")).status).toBe(200)
    expect(calls.map((c) => c.billingDay)).toEqual(["2026-09-15", "2026-10-01"])
  })

  it("PLANTED: a future or malformed date is 400 and runs nothing", async () => {
    for (const d of ["2026-10-02", "2026-9-30", "yesterday", "2026-09-30T00:00"]) {
      expect((await get(`?date=${encodeURIComponent(d)}`)).status).toBe(400)
    }
    expect(calls).toEqual([])
    expect(runs).toEqual([])
  })

  it("PLANTED: without cron auth nothing runs", async () => {
    authed = false
    expect((await get()).status).toBe(401)
    expect(calls).toEqual([])
  })
})
