import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getLeaseCreationGate } from "../leaseCreationGate"

/** Table-dispatching mock: each .from(table) returns a chainable, awaitable builder resolving to tables[table]. */
function makeDb(tables: Record<string, { data: unknown; error: null }>): SupabaseClient {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, in: () => chain, is: () => chain, limit: () => chain,
        single: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      }
      return chain
    },
  } as unknown as SupabaseClient
}

describe("getLeaseCreationGate", () => {
  it("never gates a self-managing 'landlord' org (no trust account needed)", async () => {
    const db = makeDb({ organisations: { data: { type: "landlord" }, error: null } })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: true, ownerName: null })
  })

  it("allows an agency once a trust-type account exists", async () => {
    const db = makeDb({
      organisations: { data: { type: "agency" }, error: null },
      bank_accounts: { data: [{ id: "ba-1" }], error: null },
    })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: true, ownerName: null })
  })

  it("blocks an agency with no trust account and returns the owner's name", async () => {
    const db = makeDb({
      organisations: { data: { type: "agency" }, error: null },
      bank_accounts: { data: [], error: null },
      user_orgs: { data: { user_id: "u-1" }, error: null },
      user_profiles: { data: { full_name: "Jane Owner" }, error: null },
    })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: false, ownerName: "Jane Owner" })
  })

  it("also gates a sole_prop with no trust account", async () => {
    const db = makeDb({
      organisations: { data: { type: "sole_prop" }, error: null },
      bank_accounts: { data: [], error: null },
      user_orgs: { data: { user_id: "u-1" }, error: null },
      user_profiles: { data: { full_name: "Sam Sole" }, error: null },
    })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: false, ownerName: "Sam Sole" })
  })
})
