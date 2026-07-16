/**
 * test/db/blocked-pending-field.dbtest.ts — the automated-action fail-closed state (ADDENDUM_21E §3A-safety)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Proves the durable BLOCKED state a cron writes instead of firing-to-nowhere or silently advancing: one
 *         OPEN row per (org, action, subject) no matter how many times the cron re-runs, refreshed in place, and
 *         cleared on resolve. This is the machinery the arrears silent-advance fix (instance #1) writes into.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedEmptyOrg, teardownOrg } from "@/test/db/tier"
import { recordBlockedPendingField, resolveBlockedPendingField } from "@/lib/migration/blockedPendingField"

const db = svc()

async function openBlocks(orgId: string, subjectId: string) {
  const { data, error } = await db.from("blocked_pending_field")
    .select("id, missing_fields, resolved_at").eq("org_id", orgId).eq("subject_id", subjectId).is("resolved_at", null)
  if (error) throw new Error(error.message)
  return data
}

describe("blocked_pending_field — a cron degrades to a durable, discoverable block (§3A-safety)", () => {
  let orgId: string
  const tenantId = randomUUID()

  beforeAll(async () => { orgId = await seedEmptyOrg(db) }, 60_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  it("records ONE open block, and a re-running cron never piles up (idempotent, refreshed in place)", async () => {
    await recordBlockedPendingField(db, { orgId, action: "arrears_comm", subjectType: "tenant", subjectId: tenantId, missingFields: ["primary_email", "primary_phone"] })
    await recordBlockedPendingField(db, { orgId, action: "arrears_comm", subjectType: "tenant", subjectId: tenantId, missingFields: ["primary_email", "primary_phone"] })
    const rows = await openBlocks(orgId, tenantId)
    expect(rows, "the cron ran twice; still exactly one open block").toHaveLength(1)
    expect(rows[0].missing_fields).toEqual(["primary_email", "primary_phone"])
  }, 60_000)

  it("resolve clears the block — the field got filled and the action finally fired", async () => {
    await resolveBlockedPendingField(db, { orgId, action: "arrears_comm", subjectId: tenantId })
    expect(await openBlocks(orgId, tenantId), "no open block after resolve").toHaveLength(0)
  }, 60_000)

  it("a block can re-open after resolution (a later run hits the missing field again)", async () => {
    await recordBlockedPendingField(db, { orgId, action: "arrears_comm", subjectType: "tenant", subjectId: tenantId, missingFields: ["primary_email"] })
    const rows = await openBlocks(orgId, tenantId)
    expect(rows, "a fresh block opens; the partial-unique index only guards OPEN rows").toHaveLength(1)
    expect(rows[0].missing_fields).toEqual(["primary_email"])
  }, 60_000)
})
