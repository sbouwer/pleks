/**
 * test/db/maintenance-signoff.dbtest.ts — maintenance sign-off financials are atomic (ledger 4b, sign-off half)
 *
 * Auth:   local Supabase service client — DB-integration tier (npm run test:db).
 * Data:   sign_off_maintenance_financials_atomic RPC + maintenance_requests / maintenance_cost_allocations /
 *         trust_transactions / lease_charges.
 * Notes:  Proves the RPC does the status flip + cost-allocation insert + trust maintenance_expense debit +
 *         tenant lease_charge as ONE transaction: a failing trust post rolls back the allocation AND leaves the
 *         request 'pending_completion' — the imbalance the old `.catch()`-swallowed recordTrustTransaction left
 *         (a 'completed' request + committed allocation with no trust debit). Also covers the tenant-charge leg
 *         and the pending_completion / org guard.
 */
import { afterAll, describe, expect, it } from "vitest"
import { svc, seedLedgerCase, teardownOrg, seedUser, teardownUser, forceTrustInsertFailure } from "./tier"

const db = svc()
const orgs: string[] = []
let actor = ""
afterAll(() => { orgs.forEach(teardownOrg); if (actor) teardownUser(actor) })

type Case = Awaited<ReturnType<typeof seedLedgerCase>>

async function seedRequest(c: Case): Promise<string> {
  const { data, error } = await db.from("maintenance_requests").insert({
    org_id: c.orgId, property_id: c.propertyId, unit_id: c.unitId, lease_id: c.leaseId, tenant_id: c.tenantId,
    title: "test", description: "test", logged_by: "agent", status: "pending_completion", actual_cost_cents: 10000,
  }).select("id").single()
  if (error) throw error
  return data!.id as string
}
async function allocCount(requestId: string): Promise<number> {
  const { count } = await db.from("maintenance_cost_allocations").select("id", { count: "exact", head: true }).eq("request_id", requestId)
  return count ?? 0
}
async function trustExpenseCount(leaseId: string): Promise<number> {
  const { count } = await db.from("trust_transactions").select("id", { count: "exact", head: true }).eq("lease_id", leaseId).eq("transaction_type", "maintenance_expense")
  return count ?? 0
}
async function leaseChargeCount(leaseId: string): Promise<number> {
  const { count } = await db.from("lease_charges").select("id", { count: "exact", head: true }).eq("lease_id", leaseId).eq("charge_type", "maintenance_recovery")
  return count ?? 0
}
async function reqStatus(requestId: string): Promise<string | null> {
  const { data, error } = await db.from("maintenance_requests").select("status").eq("id", requestId).single()
  if (error) throw error
  return (data?.status as string | null) ?? null
}
function signOff(c: Case, requestId: string, allocations: unknown[]) {
  return db.rpc("sign_off_maintenance_financials_atomic", {
    p_org_id: c.orgId, p_request_id: requestId, p_actor: actor,
    p_property_id: c.propertyId, p_unit_id: c.unitId, p_lease_id: c.leaseId,
    p_statement_month: "2026-07-01", p_allocations: allocations,
  })
}

describe("maintenance sign-off financials — atomic (ledger 4b sign-off half)", () => {
  it("a failed trust post rolls the allocation back + leaves the request pending_completion, then commits cleanly", async () => {
    actor = actor || seedUser()
    const c = await seedLedgerCase(db, { invoices: [] }); orgs.push(c.orgId)
    const reqId = await seedRequest(c)
    const alloc = [{ type: "landlord_expense", amount_cents: 10000, description: "roof fix" }]

    forceTrustInsertFailure(true)
    try {
      const r = await signOff(c, reqId, alloc)
      expect(r.error).not.toBeNull()
    } finally {
      forceTrustInsertFailure(false)
    }
    expect(await allocCount(reqId)).toBe(0)                    // allocation rolled back
    expect(await reqStatus(reqId)).toBe("pending_completion")  // status NOT falsely completed

    const ok = await signOff(c, reqId, alloc)
    expect(ok.error).toBeNull()
    expect(await allocCount(reqId)).toBe(1)
    expect(await trustExpenseCount(c.leaseId)).toBe(1)         // deposit debit + allocation now consistent
    expect(await reqStatus(reqId)).toBe("completed")
  })

  it("a tenant charge on next_invoice creates a lease_charge (no trust post), atomically", async () => {
    actor = actor || seedUser()
    const c = await seedLedgerCase(db, { invoices: [] }); orgs.push(c.orgId)
    const reqId = await seedRequest(c)

    const r = await signOff(c, reqId, [{ type: "tenant_charge", amount_cents: 5000, description: "tenant damage", collection_method: "next_invoice" }])
    expect(r.error).toBeNull()
    expect(await allocCount(reqId)).toBe(1)
    expect(await leaseChargeCount(c.leaseId)).toBe(1)
    expect(await trustExpenseCount(c.leaseId)).toBe(0)
    expect(await reqStatus(reqId)).toBe("completed")
  })

  it("rejects a second sign-off (not pending_completion) — no duplicate allocation", async () => {
    actor = actor || seedUser()
    const c = await seedLedgerCase(db, { invoices: [] }); orgs.push(c.orgId)
    const reqId = await seedRequest(c)
    const alloc = [{ type: "landlord_expense", amount_cents: 10000, description: "fix" }]

    expect((await signOff(c, reqId, alloc)).error).toBeNull() // first → completed
    const dup = await signOff(c, reqId, alloc)                 // second → guard RAISE
    expect(dup.error).not.toBeNull()
    expect(await allocCount(reqId)).toBe(1)                    // no duplicate
  })
})
