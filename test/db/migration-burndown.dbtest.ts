/**
 * test/db/migration-burndown.dbtest.ts — the per-org "N records need completion" metric (ADDENDUM_21E §6)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Imports a book with incomplete records + records an automated-action block, then asserts the burn-down
 *         counts what is actually on it. The only-shrinks invariant is enforced upstream (§1); here we prove the
 *         METER reads the flag + the block correctly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport } from "@/lib/import/importRunner"
import { getMigrationBurndown } from "@/lib/migration/burndown"
import { recordBlockedPendingField } from "@/lib/migration/blockedPendingField"

const db = svc()
const HEADERS = ["Property", "Address", "City", "Province", "Unit", "First Name", "Surname", "Email", "Cell", "Lease Start", "Lease End", "Monthly Rent"] as const
const mk = (o: Partial<Record<(typeof HEADERS)[number], string>>) => Object.fromEntries(HEADERS.map((h) => [h, o[h] ?? ""])) as Record<string, string>

describe("migration burn-down — the metric counts what is on the burn-down (§6)", () => {
  let agentId: string
  let orgId: string

  beforeAll(async () => {
    agentId = seedUser()
    orgId = await seedEmptyOrg(db)
    const suggestions = matchColumns([...HEADERS])
    const w: Record<string, { field: string; entity: string }> = {}
    for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }
    await runImport(
      [
        // Row A: incomplete PROPERTY (name only) + incomplete TENANT (has email, NO phone) + a complete lease.
        mk({ Property: "Incomplete House", Unit: "1", "First Name": "No", Surname: "Phone", Email: "nophone@x.co.za", "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "8000" }),
        // Row B: complete property + complete tenant + incomplete LEASE (no rent → held draft, flagged).
        mk({ Property: "Rent Less House", Address: "2 Oak", City: "Durban", Province: "KwaZulu-Natal", Unit: "1", "First Name": "Has", Surname: "All", Email: "hasall@x.co.za", Cell: "0821112222", "Lease Start": "2024-01-01" }),
        // Row C: fully complete — must NOT be counted anywhere.
        mk({ Property: "Complete House", Address: "1 Main", City: "Cape Town", Province: "Western Cape", Unit: "1", "First Name": "All", Surname: "Good", Email: "good@x.co.za", Cell: "0829998888", "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "9000" }),
      ],
      toColumnMapping(w), toImportDecisions({ columnMapping: w, expiredLeaseAction: "skip" }), orgId, agentId, undefined, db,
    )
    await recordBlockedPendingField(db, { orgId, action: "arrears_comm", subjectType: "tenant", subjectId: randomUUID(), missingFields: ["primary_email"] })
  }, 120_000)

  afterAll(() => {
    if (orgId) teardownOrg(orgId)
    if (agentId) teardownUser(agentId)
  })

  it("counts the incomplete property, tenant, lease + the open block; excludes complete records", async () => {
    const b = await getMigrationBurndown(db, orgId)
    expect(b.properties, "the name-only property").toBe(1)
    expect(b.tenants, "the email-less tenant").toBe(1)
    expect(b.leases, "the rent-less lease (held draft)").toBe(1)
    expect(b.blocked, "the open arrears block").toBe(1)
    expect(b.total, "properties + tenants + landlords + leases").toBe(b.properties + b.tenants + b.landlords + b.leases)
  })
})
