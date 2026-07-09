import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolveActiveScreeningPolicy,
  PLATFORM_DEFAULT_SCREENING_POLICY_VERSION,
} from "../screeningPolicy"

/**
 * Table-aware mock for screening_policies. The read chain
 * (select→eq→order→limit→maybeSingle) yields `existing`; the seed chain
 * (insert→select→single) yields a fresh row OR an error (race simulation),
 * after which a re-read yields `racedWinner`.
 */
function makePolicyDb(opts: {
  existing?: { id: string; version: string; policy?: Record<string, unknown> } | null
  readError?: boolean
  seedError?: boolean
  racedWinner?: { id: string; version: string } | null
  onInsert?: (payload: Record<string, unknown>) => void
}): { db: SupabaseClient; inserts: Record<string, unknown>[] } {
  const inserts: Record<string, unknown>[] = []
  let readCount = 0

  const from = () => {
    const c: Record<string, unknown> = {}
    const self = () => c
    for (const m of ["select", "eq", "order", "limit"]) c[m] = self
    c.insert = (payload: Record<string, unknown>) => {
      inserts.push(payload)
      opts.onInsert?.(payload)
      return c
    }
    // read path terminator
    c.maybeSingle = () => {
      readCount++
      if (opts.readError) return Promise.resolve({ data: null, error: { message: "boom" } })
      // first read = the "does a policy exist?" check; later reads = race re-read
      const row = readCount === 1 ? (opts.existing ?? null) : (opts.racedWinner ?? null)
      return Promise.resolve({ data: row, error: null })
    }
    // seed path terminator
    c.single = () => {
      if (opts.seedError) return Promise.resolve({ data: null, error: { message: "unique_violation" } })
      return Promise.resolve({ data: { id: "seeded-id", version: PLATFORM_DEFAULT_SCREENING_POLICY_VERSION }, error: null })
    }
    return c
  }
  return { db: { from } as unknown as SupabaseClient, inserts }
}

describe("resolveActiveScreeningPolicy", () => {
  it("returns the org's latest existing policy without seeding + reads its authored threshold (O-17)", async () => {
    const { db, inserts } = makePolicyDb({ existing: { id: "p1", version: "v3", policy: { affordability_threshold: 0.28 } } })
    const r = await resolveActiveScreeningPolicy(db, "org-1")
    expect(r).toEqual({ id: "p1", version: "v3", affordabilityThreshold: 0.28 })
    expect(inserts).toHaveLength(0)              // no seed when one exists
  })

  it("seeds a platform-default v0 when the org has no policy, linking to it", async () => {
    const { db, inserts } = makePolicyDb({ existing: null })
    const r = await resolveActiveScreeningPolicy(db, "org-2")
    expect(r).toEqual({ id: "seeded-id", version: PLATFORM_DEFAULT_SCREENING_POLICY_VERSION, affordabilityThreshold: 0.3 })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ org_id: "org-2", version: PLATFORM_DEFAULT_SCREENING_POLICY_VERSION })
    // captures the affordability threshold as a snapshot (derived, not hardcoded)
    expect((inserts[0].policy as { affordability_threshold: number }).affordability_threshold).toBe(0.3)
  })

  it("is race-safe: a seed unique-violation falls back to the concurrent winner", async () => {
    const { db } = makePolicyDb({ existing: null, seedError: true, racedWinner: { id: "winner", version: PLATFORM_DEFAULT_SCREENING_POLICY_VERSION } })
    const r = await resolveActiveScreeningPolicy(db, "org-3")
    expect(r).toEqual({ id: "winner", version: PLATFORM_DEFAULT_SCREENING_POLICY_VERSION, affordabilityThreshold: 0.3 })
  })

  it("returns null on an unrecoverable read error (decision proceeds without linkage)", async () => {
    const { db } = makePolicyDb({ readError: true })
    const r = await resolveActiveScreeningPolicy(db, "org-4")
    expect(r).toBeNull()
  })
})
