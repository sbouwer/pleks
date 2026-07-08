/**
 * test/db/deposit-interest.dbtest.ts — deposit-interest accrual is double-post-proof (ledger 4c)
 *
 * Auth:   local Supabase service client — DB-integration tier (npm run test:db), not a unit test.
 * Data:   record_deposit_atomic RPC + leases.deposit_interest_last_accrued_date on a seeded org.
 * Notes:  Proves the watermark compare-and-set folded into record_deposit_atomic: (1) posts + advances
 *         the watermark in ONE transaction, (2) a duplicate/concurrent run that read the same stale
 *         watermark is rejected (RAISE → rollback → no second post), (3) a failed posting leaves the
 *         watermark untouched. This is the atomicity guarantee behind depositInterest.ts.
 */
import { afterAll, describe, expect, it } from "vitest"
import { svc, seedLedgerCase, teardownOrg, forceTrustInsertFailure } from "./tier"

const db = svc()
const orgs: string[] = []
afterAll(() => orgs.forEach(teardownOrg))

async function watermark(leaseId: string): Promise<string | null> {
  const { data, error } = await db
    .from("leases")
    .select("deposit_interest_last_accrued_date")
    .eq("id", leaseId)
    .single()
  if (error) throw error
  return data?.deposit_interest_last_accrued_date ?? null
}

async function interestPostCount(leaseId: string): Promise<number> {
  const { count } = await db
    .from("deposit_transactions")
    .select("id", { count: "exact", head: true })
    .eq("lease_id", leaseId)
    .eq("transaction_type", "interest_accrued")
  return count ?? 0
}

function accrue(
  c: { orgId: string; leaseId: string; tenantId: string },
  opts: { expected: string | null; advanceTo: string },
) {
  return db.rpc("record_deposit_atomic", {
    p_org_id: c.orgId,
    p_lease_id: c.leaseId,
    p_tenant_id: c.tenantId,
    p_amount_cents: 500,
    p_dep_txn_type: "interest_accrued",
    p_dep_description: "test interest accrual",
    p_trust_txn_type: "deposit_interest",
    p_trust_description: "test interest accrual",
    p_initiated_by: "pleks_system",
    p_created_by: null,
    p_property_id: null,
    p_unit_id: null,
    p_reference: "DEP-INT-TEST",
    p_effective_rate_percent: 5,
    p_rate_config_id: null,
    p_statement_month: "2026-07-01",
    p_advance_last_accrued_to: opts.advanceTo,
    p_expected_last_accrued: opts.expected,
  })
}

describe("deposit-interest accrual — double-post guard (ledger 4c)", () => {
  it("posts once + advances the watermark atomically, then rejects a stale re-accrual", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)
    await db.from("leases").update({ deposit_interest_last_accrued_date: "2026-06-01" }).eq("id", c.leaseId).eq("org_id", c.orgId)

    // First accrual: expected == current watermark → posts once + advances to 2026-07-01.
    const first = await accrue(c, { expected: "2026-06-01", advanceTo: "2026-07-01" })
    expect(first.error).toBeNull()
    expect(await interestPostCount(c.leaseId)).toBe(1)
    expect(await watermark(c.leaseId)).toBe("2026-07-01")

    // Duplicate/concurrent run that read the SAME stale watermark → compare-and-set fails → RAISE + rollback.
    const dup = await accrue(c, { expected: "2026-06-01", advanceTo: "2026-07-01" })
    expect(dup.error).not.toBeNull()
    expect(dup.error?.message ?? "").toMatch(/watermark moved|already accrued/i)
    expect(await interestPostCount(c.leaseId)).toBe(1) // no second post
    expect(await watermark(c.leaseId)).toBe("2026-07-01") // unchanged

    // The legitimate NEXT window (expected == current watermark) still posts.
    const second = await accrue(c, { expected: "2026-07-01", advanceTo: "2026-08-01" })
    expect(second.error).toBeNull()
    expect(await interestPostCount(c.leaseId)).toBe(2)
    expect(await watermark(c.leaseId)).toBe("2026-08-01")
  })

  it("leaves the watermark untouched when the posting fails (no advance without a commit)", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)
    await db.from("leases").update({ deposit_interest_last_accrued_date: "2026-06-01" }).eq("id", c.leaseId).eq("org_id", c.orgId)

    // Force the trust insert (2nd write) to fail — the whole RPC rolls back, incl. the watermark advance.
    forceTrustInsertFailure(true)
    try {
      const r = await accrue(c, { expected: "2026-06-01", advanceTo: "2026-07-01" })
      expect(r.error).not.toBeNull()
    } finally {
      forceTrustInsertFailure(false)
    }
    expect(await interestPostCount(c.leaseId)).toBe(0)
    expect(await watermark(c.leaseId)).toBe("2026-06-01") // NOT advanced
  })
})
