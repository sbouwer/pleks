/**
 * lib/deposits/disburse.dbtest.ts — disburse_deposit_atomic main-sequence atomicity guard
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Data:   drives the REAL disburse_deposit_atomic() RPC — the atomic replacement for the
 *         lib/deposits/disburse.ts main sequence (refund + deductions + forfeiture + recon + timer).
 * Notes:  The bug this kills: the old sequence posted the two trust movements with log-only .catch(),
 *         so a failed trust insert left a committed deposit_transactions debit AND flipped the recon to
 *         'refunded' with no matching trust credit — a D-TRUST-01 imbalance. The rollback case forces a
 *         trust-insert failure (temp trigger) and asserts the WHOLE disbursement rolled back.
 */
import { describe, it, expect, afterEach } from "vitest"
import { svc, seedDepositCase, teardownOrg, forceTrustInsertFailure, type SeededDeposit } from "@/test/db/tier"

const db = svc()

async function disburse(s: SeededDeposit): Promise<string | null> {
  const { error } = await db.rpc("disburse_deposit_atomic", {
    p_org_id: s.orgId,
    p_lease_id: s.leaseId,
    p_actor: null,
    p_reference: "DEPOSIT-TEST",
    p_tenant_name: "Test Tenant",
  })
  return error?.message ?? null
}

async function state(s: SeededDeposit): Promise<{ depositTxns: number; trustTxns: number; reconStatus: string | null }> {
  const dt = await db.from("deposit_transactions").select("id", { count: "exact", head: true }).eq("lease_id", s.leaseId)
  const tt = await db.from("trust_transactions").select("id", { count: "exact", head: true }).eq("lease_id", s.leaseId)
  const recon = await db.from("deposit_reconciliations").select("status").eq("id", s.reconId).single()
  return { depositTxns: dt.count ?? 0, trustTxns: tt.count ?? 0, reconStatus: (recon.data?.status as string | null) ?? null }
}

describe("disburse_deposit_atomic — main-sequence atomicity", () => {
  const seededOrgs: string[] = []
  afterEach(() => {
    forceTrustInsertFailure(false)
    for (const orgId of seededOrgs.splice(0)) teardownOrg(orgId)
  })

  it("happy path — refund + deduction post their deposit+trust rows, recon marked refunded", async () => {
    const s = await seedDepositCase(db, { refundCents: 80_000, deductionsCents: 20_000 })
    seededOrgs.push(s.orgId)
    expect(await disburse(s)).toBeNull()
    const c = await state(s)
    expect(c.depositTxns).toBe(2) // deposit_returned_to_tenant + deduction_paid_to_landlord
    expect(c.trustTxns).toBe(2) // deposit_returned (debit) + deposit_deduction (credit)
    expect(c.reconStatus).toBe("refunded")
  })

  it("trust posting fails — the ENTIRE disbursement rolls back (no deposit txn, recon NOT refunded)", async () => {
    const s = await seedDepositCase(db, { refundCents: 80_000, deductionsCents: 20_000 })
    seededOrgs.push(s.orgId)
    forceTrustInsertFailure(true)
    const err = await disburse(s)
    expect(err, "RPC should raise when the trust posting fails").not.toBeNull()
    const c = await state(s)
    // The deposit debit is inserted BEFORE the trust posting in the RPC — it must roll back with it.
    expect(c.depositTxns).toBe(0)
    expect(c.trustTxns).toBe(0)
    expect(c.reconStatus).not.toBe("refunded") // recon must NOT be falsely marked done
  })
})
