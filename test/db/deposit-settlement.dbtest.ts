/**
 * test/db/deposit-settlement.dbtest.ts — deposit-charge settlement (Pattern B/C) is atomic (ledger 4b)
 *
 * Auth:   local Supabase service client — DB-integration tier (npm run test:db), not a unit test.
 * Data:   settle_deposit_charge_atomic RPC + deposit_charges / deposit_transactions / trust_transactions.
 * Notes:  Proves settle_deposit_charge_atomic commits the deposit debit + (Pattern B) trust credit + the
 *         charge link as ONE transaction: a failing trust post rolls the deposit debit AND the charge link
 *         back — the D-TRUST-01 imbalance settlePatternB used to leave (deposit debit committed, no trust
 *         credit). Pattern C links the charge atomically with the debit, and the org-scope guard rejects a
 *         foreign charge.
 */
import { afterAll, describe, expect, it } from "vitest"
import { svc, seedLedgerCase, teardownOrg, forceTrustInsertFailure } from "./tier"

const db = svc()
const orgs: string[] = []
afterAll(() => orgs.forEach(teardownOrg))

const AMOUNT = 5000

async function seedCharge(c: { orgId: string; leaseId: string }): Promise<string> {
  const { data, error } = await db.from("deposit_charges").insert({
    org_id: c.orgId, lease_id: c.leaseId, charge_type: "other",
    description: "test charge", deduction_amount_cents: AMOUNT, agent_confirmed: true,
  }).select("id").single()
  if (error) throw error
  return data!.id as string
}
async function depTxnCount(leaseId: string): Promise<number> {
  const { count } = await db.from("deposit_transactions").select("id", { count: "exact", head: true }).eq("lease_id", leaseId)
  return count ?? 0
}
async function trustDeductionCount(leaseId: string): Promise<number> {
  const { count } = await db.from("trust_transactions").select("id", { count: "exact", head: true }).eq("lease_id", leaseId).eq("transaction_type", "deposit_deduction")
  return count ?? 0
}
async function chargeLink(chargeId: string): Promise<string | null> {
  const { data, error } = await db.from("deposit_charges").select("settling_deposit_txn_id").eq("id", chargeId).single()
  if (error) throw error
  return data?.settling_deposit_txn_id ?? null
}
function settle(c: { orgId: string; leaseId: string; tenantId: string }, chargeId: string, withTrust: boolean) {
  return db.rpc("settle_deposit_charge_atomic", {
    p_org_id: c.orgId, p_lease_id: c.leaseId, p_tenant_id: c.tenantId, p_charge_id: chargeId,
    p_amount_cents: AMOUNT, p_dep_description: "test charge — cost recovery", p_actor: null,
    p_with_trust: withTrust, p_trust_description: withTrust ? "test charge — trust recovery" : null,
  })
}

describe("deposit-charge settlement — atomic Pattern B/C (ledger 4b)", () => {
  it("Pattern B: a failed trust post rolls the deposit debit AND the charge link back, then commits cleanly", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)
    const chargeId = await seedCharge(c)

    // Force the trust insert (2nd write) to fail — the whole settlement must roll back.
    forceTrustInsertFailure(true)
    try {
      const r = await settle(c, chargeId, true)
      expect(r.error).not.toBeNull()
    } finally {
      forceTrustInsertFailure(false)
    }
    expect(await depTxnCount(c.leaseId)).toBe(0)   // deposit debit rolled back (was left committed before 4b)
    expect(await chargeLink(chargeId)).toBeNull()  // charge NOT linked → a re-run is safe, no double-settle

    // Now deposit debit + trust credit + charge link all commit together.
    const ok = await settle(c, chargeId, true)
    expect(ok.error).toBeNull()
    expect(await depTxnCount(c.leaseId)).toBe(1)
    expect(await trustDeductionCount(c.leaseId)).toBe(1)
    expect(await chargeLink(chargeId)).not.toBeNull()
  })

  it("Pattern C: links the charge atomically with the deposit debit, no trust post", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)
    const chargeId = await seedCharge(c)

    const r = await settle(c, chargeId, false)
    expect(r.error).toBeNull()
    expect(await depTxnCount(c.leaseId)).toBe(1)
    expect(await trustDeductionCount(c.leaseId)).toBe(0) // no trust for an ad-hoc charge
    expect(await chargeLink(chargeId)).not.toBeNull()
  })

  it("rejects a charge from another org (scope guard) — nothing written", async () => {
    const a = await seedLedgerCase(db, { invoices: [] }); orgs.push(a.orgId)
    const b = await seedLedgerCase(db, { invoices: [] }); orgs.push(b.orgId)
    const bCharge = await seedCharge(b)

    const r = await db.rpc("settle_deposit_charge_atomic", {
      p_org_id: a.orgId, p_lease_id: a.leaseId, p_tenant_id: a.tenantId, p_charge_id: bCharge,
      p_amount_cents: AMOUNT, p_dep_description: "x", p_actor: null, p_with_trust: false,
    })
    expect(r.error).not.toBeNull()
    expect(await depTxnCount(a.leaseId)).toBe(0)
    expect(await chargeLink(bCharge)).toBeNull() // org B's charge untouched
  })
})
