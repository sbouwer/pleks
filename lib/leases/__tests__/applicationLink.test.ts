/**
 * lib/leases/__tests__/applicationLink.test.ts — the approval → lease hand-off (arc 2 B2)
 *
 * Notes:  Both directions per rule: an approved, lease-less application of this org validates and back-links; a
 *         foreign/unapproved one, one already holding a lease, or one for another tenant/unit is refused; and the
 *         insert-and-claim (the one-lease lock) only fills an empty resulting_lease_id — a second create discards
 *         its own draft and names the holder (or tells a double-submitter it is theirs); a winner is never discarded. Co prefill (walker F1): only live, non-surety co rows
 *         holding a tenant row; the mock really filters every .eq/.is/.not/.neq, and foreign-org rows sit first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(async () => undefined) }))

import { REDACTED } from "@/lib/popia/anonymisePlan"
import {
  checkOriginatingApplication, insertLeaseClaimingApplication, resolveApprovedApplication,
} from "../applicationLink"

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let updates: { table: string; patch: Row; filters: string[] }[]
let deletes: string[][]
let updateError: { message: string } | null
let insertError: { code: string; message: string } | null
let seq = 0

/** Filters rows by every .eq/.is the chain applied, so an org or status mismatch genuinely returns nothing. */
function makeDb(): SupabaseClient {
  return {
    from(table: string) {
      const eqs: [string, unknown][] = []
      const isNull: string[] = []
      const notNull: string[] = []
      const neqs: [string, unknown][] = []
      let patch: Row | null = null
      let deleting = false
      let inserted: Row | null = null
      const matches = (r: Row) => eqs.every(([c, v]) => r[c] === v) && isNull.every((c) => r[c] == null)
        && notNull.every((c) => r[c] != null) && neqs.every(([c, v]) => r[c] !== v)
      const rows = () => (tables[table] ?? []).filter(matches)
      const chain: Record<string, unknown> = {
        select: () => chain, order: () => chain, limit: () => chain,
        not: (c: string, op: string, v: unknown) => {
          if (op === "is" && v === null) { notNull.push(c) }
          return chain
        },
        neq: (c: string, v: unknown) => { neqs.push([c, v]); return chain },
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain },
        is: (c: string) => { isNull.push(c); return chain },
        update: (p: Row) => { patch = p; return chain },
        delete: () => { deleting = true; return chain },
        insert: (r: Row) => {
          if (insertError) { inserted = null; return chain }
          const row = { id: `lease${++seq}`, status: "draft", ...r }
          tables[table] = [...(tables[table] ?? []), row]
          inserted = row
          return chain
        },
        single: async () => (insertError
          ? { data: null, error: insertError }
          : { data: inserted ? { id: inserted.id } : null, error: null }),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (deleting) {
            deletes.push(eqs.map(([c, v]) => `${c}=${String(v)}`))
            tables[table] = (tables[table] ?? []).filter((r) => !matches(r))
            return Promise.resolve({ data: null, error: null }).then(res)
          }
          if (patch && updateError) return Promise.resolve({ data: null, error: updateError }).then(res)
          if (patch) {
            const hit = rows()
            updates.push({ table, patch, filters: eqs.map(([c, v]) => `${c}=${String(v)}`).concat(isNull.map((c) => `${c} is null`)) })
            hit.forEach((r) => Object.assign(r, patch))
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res)
          }
          return Promise.resolve({ data: rows(), error: null }).then(res)
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  tables = {
    applications: [
      { id: "app1", org_id: "org1", tenant_id: "t1", unit_id: "u1", listing_id: "l1", stage2_status: "approved", resulting_lease_id: null },
      { id: "app2", org_id: "org1", tenant_id: "t2", unit_id: "u1", listing_id: "l1", stage2_status: "screening_complete", resulting_lease_id: null },
      // Same tenant + unit as app1, another org: only the org filter can refuse it.
      { id: "app3", org_id: "org2", tenant_id: "t1", unit_id: "u1", listing_id: "l1", stage2_status: "approved", resulting_lease_id: null },
      { id: "app4", org_id: "org1", tenant_id: "t4", unit_id: "u1", listing_id: "l1", stage2_status: "approved", resulting_lease_id: "lease0" },
    ],
    // Holders are named only as live members of the org; uX belongs to org2.
    user_orgs: [{ user_id: "uX", org_id: "org2", deleted_at: null }, { user_id: "u9", org_id: "org1", deleted_at: null }],
    // A foreign-org row first under the same id: dropping a read's org filter picks it.
    units: [{ id: "u1", org_id: "org2", property_id: "pX" }, { id: "u1", org_id: "org1", property_id: "p1" }],
    listings: [{ id: "l1", org_id: "org2", asking_rent_cents: 1 }, { id: "l1", org_id: "org1", asking_rent_cents: 1_200_000 }],
    application_co_applicants: [
      { primary_application_id: "app1", org_id: "org2", tenant_id: "tX", declined_at: null, applicant_email: "x@x" },
      { primary_application_id: "app1", org_id: "org1", tenant_id: "t1b", declined_at: null, applicant_email: "b@x" },
      { primary_application_id: "app1", org_id: "org1", tenant_id: "t-declined", declined_at: "2026-10-01", applicant_email: "d@x" },
      { primary_application_id: "app1", org_id: "org1", tenant_id: "t-erased", declined_at: null, applicant_email: REDACTED },
      { primary_application_id: "app1", org_id: "org1", tenant_id: "t-surety", declined_at: null, applicant_email: "s@x", is_surety_director: true },
      { primary_application_id: "app1", org_id: "org1", tenant_id: "t-guarantor", declined_at: null, applicant_email: "g@x", role: "guarantor" },
      { primary_application_id: "app1", org_id: "org1", tenant_id: null, declined_at: null, applicant_email: "n@x" },
    ],
  }
  updates = []
  deletes = []
  updateError = null
  insertError = null
  seq = 0
})

describe("resolveApprovedApplication", () => {
  it("resolves an approved application into unit, property, listing rent and linked co-tenants", async () => {
    expect(await resolveApprovedApplication(makeDb(), "org1", "app1")).toEqual({
      id: "app1", tenantId: "t1", unitId: "u1", propertyId: "p1", listingRentCents: 1_200_000,
      coTenantIds: ["t1b"], resultingLeaseId: null,
    })
  })

  it("is null for an application not yet approved, or in another org", async () => {
    expect(await resolveApprovedApplication(makeDb(), "org1", "app2")).toBeNull()
    expect(await resolveApprovedApplication(makeDb(), "org1", "app3")).toBeNull()
  })
})

describe("checkOriginatingApplication", () => {
  const lease = { tenantId: "t1", unitId: "u1" }

  it("no application sent → nothing to stamp", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", null, lease, "user1")).toEqual({ applicationId: null })
  })

  it("accepts the approved application for the same tenant and unit", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", "app1", lease, "user1")).toEqual({ applicationId: "app1" })
  })

  it("refuses a foreign or unapproved application", async () => {
    // app3 matches tenant + unit exactly, so only the org boundary refuses it.
    expect(await checkOriginatingApplication(makeDb(), "org1", "app3", lease, "user1")).toHaveProperty("error")
    expect(await checkOriginatingApplication(makeDb(), "org1", "app2", { tenantId: "t2", unitId: "u1" }, "user1")).toHaveProperty("error")
  })

  it("refuses an application that already produced a lease, naming nobody when the holder is unreadable", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", "app4", { tenantId: "t4", unitId: "u1" }, "user1"))
      .toEqual({ error: expect.stringMatching(/^A colleague is already creating/) })
  })

  it("names who holds the application's lease, read through the org-bound lease", async () => {
    tables.leases = [{ id: "lease0", org_id: "org2", created_by: "uX" }, { id: "lease0", org_id: "org1", created_by: "u9" }]
    tables.user_profiles = [{ id: "uX", full_name: "Foreign Agent" }, { id: "u9", full_name: "Jane Smith" }]
    expect(await checkOriginatingApplication(makeDb(), "org1", "app4", { tenantId: "t4", unitId: "u1" }, "user1"))
      .toEqual({ error: expect.stringMatching(/^Jane Smith is already creating/) })
  })

  it("never names a lease creator who is not a member of the org", async () => {
    tables.leases = [{ id: "lease0", org_id: "org1", created_by: "uX" }]
    tables.user_profiles = [{ id: "uX", full_name: "Foreign Agent" }]
    expect(await checkOriginatingApplication(makeDb(), "org1", "app4", { tenantId: "t4", unitId: "u1" }, "user1"))
      .toEqual({ error: expect.stringMatching(/^A colleague is already creating/) })
  })

  it("tells the holder it is their own lease (a double submit), not their name", async () => {
    tables.leases = [{ id: "lease0", org_id: "org1", created_by: "u9" }]
    expect(await checkOriginatingApplication(makeDb(), "org1", "app4", { tenantId: "t4", unitId: "u1" }, "u9"))
      .toEqual({ error: expect.stringMatching(/^You have already created/) })
  })

  it("refuses when the agent changed the tenant or unit in the wizard", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", "app1", { tenantId: "tX", unitId: "u1" }, "user1")).toHaveProperty("error")
    expect(await checkOriginatingApplication(makeDb(), "org1", "app1", { tenantId: "t1", unitId: "uX" }, "user1")).toHaveProperty("error")
  })
})

describe("insertLeaseClaimingApplication — one lease per application", () => {
  const row = { unit_id: "u1", tenant_id: "t1", created_by: "user1" }

  it("without an application: inserts the org's lease and claims nothing", async () => {
    expect(await insertLeaseClaimingApplication(makeDb(), "org1", row, null, "user1")).toEqual({ leaseId: "lease1" })
    expect(tables.leases).toEqual([expect.objectContaining({ id: "lease1", org_id: "org1", originating_application_id: null })])
    expect(updates).toHaveLength(0)
  })

  it("the winner stamps and claims the application, org-bound, and is never discarded", async () => {
    expect(await insertLeaseClaimingApplication(makeDb(), "org1", row, "app1", "user1")).toEqual({ leaseId: "lease1" })
    expect(tables.leases[0]).toMatchObject({ org_id: "org1", originating_application_id: "app1" })
    expect(tables.applications[0].resulting_lease_id).toBe("lease1")
    expect(updates[0].filters).toEqual(expect.arrayContaining(["id=app1", "org_id=org1", "resulting_lease_id is null"]))
    expect(deletes).toHaveLength(0)
  })

  it("the claim clears the 'currently creating' marker", async () => {
    Object.assign(tables.applications[0], { lease_started_by: "user1", lease_started_at: "2026-10-09T12:00:00Z" })
    await insertLeaseClaimingApplication(makeDb(), "org1", row, "app1", "user1")
    expect(tables.applications[0]).toMatchObject({ lease_started_by: null, lease_started_at: null })
  })

  it("the unique index's 23505 is told as the named message, never the raw constraint", async () => {
    tables.applications[0].resulting_lease_id = "lease0"
    tables.leases = [{ id: "lease0", org_id: "org1", created_by: "u9" }]
    tables.user_profiles = [{ id: "u9", full_name: "Jane Smith" }]
    insertError = { code: "23505", message: "duplicate key value violates unique constraint" }
    expect(await insertLeaseClaimingApplication(makeDb(), "org1", row, "app1", "user1"))
      .toEqual({ error: expect.stringMatching(/^Jane Smith is already creating/) })
  })

  it("two creates from one application: the second discards its own draft and names the first", async () => {
    const db = makeDb()
    tables.user_profiles = [{ id: "u9", full_name: "Jane Smith" }]
    expect(await insertLeaseClaimingApplication(db, "org1", { ...row, created_by: "u9" }, "app1", "u9")).toEqual({ leaseId: "lease1" })
    expect(await insertLeaseClaimingApplication(db, "org1", { ...row, created_by: "u2" }, "app1", "u2"))
      .toEqual({ error: expect.stringMatching(/^Jane Smith is already creating/) })
    expect(tables.applications[0].resulting_lease_id).toBe("lease1")
    expect(tables.leases.map((l) => l.id)).toEqual(["lease1"])
    expect(deletes[0]).toEqual(expect.arrayContaining(["id=lease2", "org_id=org1", "status=draft"]))
  })

  it("cannot claim another org's application — its own draft is discarded", async () => {
    expect(await insertLeaseClaimingApplication(makeDb(), "org1", row, "app3", "user1")).toHaveProperty("error")
    expect(tables.applications[2].resulting_lease_id).toBeNull()
    expect(tables.leases).toHaveLength(0)
  })

  it("a failed claim discards the draft and says to try again", async () => {
    updateError = { message: "boom" }
    expect(await insertLeaseClaimingApplication(makeDb(), "org1", row, "app1", "user1"))
      .toEqual({ error: expect.stringMatching(/Try again/) })
    expect(tables.leases).toHaveLength(0)
  })
})
