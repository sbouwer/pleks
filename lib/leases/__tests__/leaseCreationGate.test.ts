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
  it("allows self-managing orgs (own_only) without any trust account", async () => {
    const db = makeDb({ organisations: { data: { management_scope: "own_only" }, error: null } })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: true, ownerName: null })
  })

  it("allows an agency org once a trust-type account exists", async () => {
    const db = makeDb({
      organisations: { data: { management_scope: "own_and_others" }, error: null },
      bank_accounts: { data: [{ id: "ba-1" }], error: null },
    })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: true, ownerName: null })
  })

  it("blocks an agency org with no trust account and returns the owner's name", async () => {
    const db = makeDb({
      organisations: { data: { management_scope: "others_only" }, error: null },
      bank_accounts: { data: [], error: null },
      user_orgs: { data: { user_id: "u-1" }, error: null },
      user_profiles: { data: { full_name: "Jane Owner" }, error: null },
    })
    expect(await getLeaseCreationGate(db, "org-1")).toEqual({ allowed: false, ownerName: "Jane Owner" })
  })
})
