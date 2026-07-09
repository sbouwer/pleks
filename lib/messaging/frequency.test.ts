/**
 * lib/messaging/frequency.test.ts — the anti-storm frequency limiter (comms audit C-2)
 *
 * The limiter was inert in production: it counted communication_log rows by entity_type='tenant', which no
 * sender ever writes, so every cap counted zero and always allowed. These tests pin the fix — it counts by
 * the populated tenant_id COLUMN — and that a second arrears reminder inside the window is actually refused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const H = vi.hoisted(() => {
  const state = { count: 0, filters: {} as Record<string, unknown> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: (c: string, v: unknown) => { state.filters[c] = v; return chain },
    in: () => chain,
    gte: () => chain,
    then: (r: (x: { count: number; error: null }) => unknown) => r({ count: state.count, error: null }),
  }
  return { state, db: { from: () => chain } }
})

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(async () => H.db) }))

import { checkFrequencyLimit } from "./frequency"

beforeEach(() => { H.state.count = 0; H.state.filters = {} })

describe("checkFrequencyLimit — C-2", () => {
  it("counts by the tenant_id COLUMN, never entity_type='tenant'", async () => {
    await checkFrequencyLimit("t1", "arrears.reminder_step1")
    expect(H.state.filters.tenant_id).toBe("t1")
    expect(H.state.filters.entity_type).toBeUndefined()   // the inert filter is gone
    expect(H.state.filters.status).toBe("sent")           // only successful sends count toward the cap
  })

  it("REFUSES a second arrears reminder inside the 48h window (the storm cap now bites)", async () => {
    H.state.count = 1   // arrears cap is 1 / 48h
    const r = await checkFrequencyLimit("t1", "arrears.reminder_step2")
    expect(r.allowed).toBe(false)
  })

  it("allows when under the cap", async () => {
    H.state.count = 0
    expect((await checkFrequencyLimit("t1", "arrears.reminder_step1")).allowed).toBe(true)
  })

  it("allows (no query) for a template with no configured topic", async () => {
    const r = await checkFrequencyLimit("t1", "some.unlimited_template")
    expect(r.allowed).toBe(true)
    expect(H.state.filters.tenant_id).toBeUndefined()   // short-circuited before the DB
  })
})
