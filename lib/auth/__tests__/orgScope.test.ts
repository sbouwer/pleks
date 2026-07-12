/**
 * lib/auth/__tests__/orgScope.test.ts — the client-supplied-FK ownership assertion (AUDIT_IMPORT F-2)
 *
 * isRowInOrg is the primitive both F-2 fixes (createInspection, promoteApplicationToTenant) route through, so
 * its contract is pinned here: a row only counts as owned when it exists AND matches orgId; a null id and a
 * query error both fail CLOSED (an unreadable ownership check is never an ownership grant). A future edit that
 * flips any of these silently reopens a cross-org IDOR — these fail on that.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isRowInOrg } from "../orgScope"

/** Chainable select→eq→eq→maybeSingle mock; records whether a query was issued and the org filter applied. */
function makeDb(result: { data?: unknown; error?: unknown }): { db: SupabaseClient; calls: { queried: boolean; eqs: Array<[string, unknown]> } } {
  const calls = { queried: false, eqs: [] as Array<[string, unknown]> }
  const maybeSingle = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => { calls.eqs.push([col, val]); return chain },
    maybeSingle,
  }
  const db = { from: () => { calls.queried = true; return chain } } as unknown as SupabaseClient
  return { db, calls }
}

describe("isRowInOrg", () => {
  it("is true when a row exists and matches the org (and it filtered by both id AND org_id)", async () => {
    const { db, calls } = makeDb({ data: { id: "unit-1" } })
    expect(await isRowInOrg(db, "units", "unit-1", "org-A")).toBe(true)
    expect(calls.eqs).toEqual([["id", "unit-1"], ["org_id", "org-A"]])   // both filters applied
  })

  it("is FALSE for a foreign / not-found id (the row is not in the caller's org)", async () => {
    const { db } = makeDb({ data: null })   // .eq("org_id", callerOrg) matched nothing
    expect(await isRowInOrg(db, "leases", "lease-belonging-to-org-B", "org-A")).toBe(false)
  })

  it("is FALSE for a null/empty id WITHOUT issuing a query", async () => {
    const { db, calls } = makeDb({ data: { id: "x" } })
    expect(await isRowInOrg(db, "tenants", null, "org-A")).toBe(false)
    expect(await isRowInOrg(db, "tenants", "", "org-A")).toBe(false)
    expect(calls.queried).toBe(false)
  })

  it("FAILS CLOSED on a query error — an unreadable check is not an ownership grant", async () => {
    const { db } = makeDb({ error: { message: "timeout" } })
    expect(await isRowInOrg(db, "properties", "prop-1", "org-A")).toBe(false)
  })
})
