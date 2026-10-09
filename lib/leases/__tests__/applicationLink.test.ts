/**
 * lib/leases/__tests__/applicationLink.test.ts — the approval → lease hand-off (arc 2 B2)
 *
 * Notes:  Both directions per rule: an approved, lease-less application of this org validates and back-links; a
 *         foreign/unapproved one, one already holding a lease, or one for another tenant/unit is refused; and the
 *         back-link only fills an empty resulting_lease_id. Co prefill (walker F1): only live, non-surety co rows
 *         holding a tenant row; the mock really filters every .eq/.is/.not/.neq, and foreign-org rows sit first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(async () => undefined) }))

import { REDACTED } from "@/lib/popia/anonymisePlan"
import { checkOriginatingApplication, linkApplicationToLease, resolveApprovedApplication } from "../applicationLink"

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let updates: { table: string; patch: Row; filters: string[] }[]

/** Filters rows by every .eq/.is the chain applied, so an org or status mismatch genuinely returns nothing. */
function makeDb(): SupabaseClient {
  return {
    from(table: string) {
      const eqs: [string, unknown][] = []
      const isNull: string[] = []
      const notNull: string[] = []
      const neqs: [string, unknown][] = []
      let patch: Row | null = null
      const rows = () => (tables[table] ?? []).filter((r) =>
        eqs.every(([c, v]) => r[c] === v) && isNull.every((c) => r[c] == null)
        && notNull.every((c) => r[c] != null) && neqs.every(([c, v]) => r[c] !== v))
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
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
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
    expect(await checkOriginatingApplication(makeDb(), "org1", null, lease)).toEqual({ applicationId: null })
  })

  it("accepts the approved application for the same tenant and unit", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", "app1", lease)).toEqual({ applicationId: "app1" })
  })

  it("refuses a foreign or unapproved application", async () => {
    // app3 matches tenant + unit exactly, so only the org boundary refuses it.
    expect(await checkOriginatingApplication(makeDb(), "org1", "app3", lease)).toHaveProperty("error")
    expect(await checkOriginatingApplication(makeDb(), "org1", "app2", { tenantId: "t2", unitId: "u1" })).toHaveProperty("error")
  })

  it("refuses an application that already produced a lease", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", "app4", { tenantId: "t4", unitId: "u1" }))
      .toEqual({ error: expect.stringMatching(/already created/) })
  })

  it("refuses when the agent changed the tenant or unit in the wizard", async () => {
    expect(await checkOriginatingApplication(makeDb(), "org1", "app1", { tenantId: "tX", unitId: "u1" })).toHaveProperty("error")
    expect(await checkOriginatingApplication(makeDb(), "org1", "app1", { tenantId: "t1", unitId: "uX" })).toHaveProperty("error")
  })
})

describe("linkApplicationToLease", () => {
  it("fills an empty link, bound to the org", async () => {
    await linkApplicationToLease(makeDb(), "org1", "app1", "leaseN", "user1")
    expect(tables.applications[0].resulting_lease_id).toBe("leaseN")
    expect(updates[0].filters).toEqual(expect.arrayContaining(["id=app1", "org_id=org1", "resulting_lease_id is null"]))
  })

  it("never re-points an application that already has a lease", async () => {
    await linkApplicationToLease(makeDb(), "org1", "app4", "leaseN", "user1")
    expect(tables.applications[3].resulting_lease_id).toBe("lease0")
  })
})
