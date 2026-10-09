/**
 * lib/leases/__tests__/leaseStartMarker.test.ts — the advisory "currently creating" marker (arc 2)
 *
 * Notes:  Both directions per rule: free / mine / stale is taken, a colleague's live marker is not (and names them),
 *         take-over takes it anyway; a leased or foreign-org application is never marked; release clears only my
 *         marker. The mock evaluates every .eq/.is and the .or clauses the module writes, and foreign-org rows sit
 *         first so a dropped org filter picks the wrong row.
 */
import { describe, it, expect, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  readLeaseStartHolder, releaseLeaseStartMarker, startedAgoLabel, takeLeaseStartMarker,
} from "../leaseStartMarker"

type Row = Record<string, unknown>
let tables: Record<string, Row[]>

/** `col.op.value` clauses joined by commas; only the forms the module writes (is.null, eq, lt with a quoted ISO). */
function orMatches(r: Row, expr: string): boolean {
  return expr.split(",").some((clause) => {
    const [col, op, ...rest] = clause.split(".")
    const value = rest.join(".").replace(/^"|"$/g, "")
    if (op === "is" && value === "null") return r[col] == null
    if (op === "eq") return r[col] === value
    if (op === "lt") return r[col] != null && (r[col] as string) < value
    throw new Error(`unhandled or-clause ${clause}`)
  })
}

function makeDb(): SupabaseClient {
  return {
    from(table: string) {
      const eqs: [string, unknown][] = []
      const isNull: string[] = []
      const ors: string[] = []
      let patch: Row | null = null
      const matches = (r: Row) => eqs.every(([c, v]) => r[c] === v) && isNull.every((c) => r[c] == null)
        && ors.every((o) => orMatches(r, o))
      const rows = () => (tables[table] ?? []).filter(matches)
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain },
        is: (c: string) => { isNull.push(c); return chain },
        or: (o: string) => { ors.push(o); return chain },
        limit: () => chain,
        update: (p: Row) => { patch = p; return chain },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          const hit = rows()
          if (patch) hit.forEach((r) => Object.assign(r, patch))
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res)
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
}

const NOW = new Date("2026-10-09T12:00:00.000Z")
const MIN = 60_000
const ago = (m: number) => new Date(NOW.getTime() - m * MIN).toISOString()

beforeEach(() => {
  tables = {
    applications: [
      // Same id in another org first, held by someone: a dropped org filter would read or write it.
      { id: "app1", org_id: "org2", lease_started_by: "uX", lease_started_at: ago(1), resulting_lease_id: null },
      { id: "app1", org_id: "org1", lease_started_by: null, lease_started_at: null, resulting_lease_id: null },
      { id: "app2", org_id: "org1", lease_started_by: null, lease_started_at: null, resulting_lease_id: "lease0" },
    ],
    user_profiles: [{ id: "jane", full_name: "Jane Smith" }, { id: "outsider", full_name: "Other Org User" }],
    // jane is a live member of org1; outsider belongs to org2 only, and a removed membership never counts.
    user_orgs: [
      { user_id: "outsider", org_id: "org2", deleted_at: null },
      { user_id: "outsider", org_id: "org1", deleted_at: "2026-10-01T00:00:00Z" },
      { user_id: "jane", org_id: "org1", deleted_at: null },
    ],
  }
})
const mine = () => tables.applications[1]

describe("takeLeaseStartMarker", () => {
  it("takes a free marker on the org's application, and only that row", async () => {
    expect(await takeLeaseStartMarker(makeDb(), "org1", "app1", "me", { now: NOW })).toEqual({ taken: true })
    expect(mine()).toMatchObject({ lease_started_by: "me", lease_started_at: NOW.toISOString() })
    expect(tables.applications[0].lease_started_by).toBe("uX")
  })

  it("re-takes my own marker (a refresh), refreshing its time", async () => {
    Object.assign(mine(), { lease_started_by: "me", lease_started_at: ago(10) })
    expect(await takeLeaseStartMarker(makeDb(), "org1", "app1", "me", { now: NOW })).toEqual({ taken: true })
    expect(mine().lease_started_at).toBe(NOW.toISOString())
  })

  it("refuses a colleague's live marker and names them", async () => {
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: ago(4) })
    expect(await takeLeaseStartMarker(makeDb(), "org1", "app1", "me", { now: NOW }))
      .toEqual({ taken: false, holder: { name: "Jane Smith", startedAt: ago(4) } })
    expect(mine().lease_started_by).toBe("jane")
  })

  it("takes a colleague's stale marker (past the hold window)", async () => {
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: ago(31) })
    expect(await takeLeaseStartMarker(makeDb(), "org1", "app1", "me", { now: NOW })).toEqual({ taken: true })
    expect(mine().lease_started_by).toBe("me")
  })

  it("take-over takes a colleague's live marker", async () => {
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: ago(4) })
    expect(await takeLeaseStartMarker(makeDb(), "org1", "app1", "me", { now: NOW, takeOver: true })).toEqual({ taken: true })
    expect(mine().lease_started_by).toBe("me")
  })

  it("never marks an application that already has its lease", async () => {
    expect(await takeLeaseStartMarker(makeDb(), "org1", "app2", "me", { now: NOW, takeOver: true }))
      .toEqual({ taken: false, holder: null })
    expect(tables.applications[2].lease_started_by).toBeNull()
  })
})

describe("readLeaseStartHolder", () => {
  it("is null for none, mine, stale, or another org's marker", async () => {
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toBeNull()
    Object.assign(mine(), { lease_started_by: "me", lease_started_at: ago(1) })
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toBeNull()
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: ago(45) })
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toBeNull()
  })

  it("names a colleague's live marker", async () => {
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: ago(4) })
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toEqual({ name: "Jane Smith", startedAt: ago(4) })
  })

  it("never names a holder who is not a live member of the org (a planted foreign uuid)", async () => {
    Object.assign(mine(), { lease_started_by: "outsider", lease_started_at: ago(4) })
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toEqual({ name: null, startedAt: ago(4) })
  })

  it("reads PostgREST's +00:00 timestamps by instant, not as text", async () => {
    const pg = (m: number) => ago(m).replace(".000Z", "+00:00")
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: pg(31) })
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toBeNull()
    Object.assign(mine(), { lease_started_at: pg(29) })
    expect(await readLeaseStartHolder(makeDb(), "org1", "app1", "me", NOW)).toEqual({ name: "Jane Smith", startedAt: pg(29) })
  })
})

describe("releaseLeaseStartMarker", () => {
  it("clears my marker, never a colleague's", async () => {
    Object.assign(mine(), { lease_started_by: "jane", lease_started_at: ago(4) })
    await releaseLeaseStartMarker(makeDb(), "org1", "app1", "me")
    expect(mine().lease_started_by).toBe("jane")
    Object.assign(mine(), { lease_started_by: "me" })
    await releaseLeaseStartMarker(makeDb(), "org1", "app1", "me")
    expect(mine()).toMatchObject({ lease_started_by: null, lease_started_at: null })
    expect(tables.applications[0].lease_started_by).toBe("uX")
  })
})

describe("startedAgoLabel", () => {
  it("words the age", () => {
    expect(startedAgoLabel(ago(0), NOW)).toBe("just now")
    expect(startedAgoLabel(ago(4), NOW)).toBe("4 min ago")
  })
})
