/**
 * test/db/trust-immutability.dbtest.ts — the trust ledger's immutability guard, both halves
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Notes:  `check_trust_txn_period_open()` fires BEFORE UPDATE **OR DELETE** on trust_transactions. It used to
 *         `RETURN NEW` — and on a DELETE, NEW is NULL. A BEFORE-row trigger that returns NULL SILENTLY CANCELS
 *         THE ROW. So every DELETE against the trust ledger reported success and removed nothing, in every
 *         period, open or closed. Not immutability by design: a typo that swallowed the operation while
 *         telling the caller it had worked.
 *
 *         It surfaced when a purge of invented interest deleted the deposit-side rows and "deleted" the paired
 *         trust rows — leaving the two ledgers disagreeing with each other, which is the one thing a dual-write
 *         ledger must never do. A silent no-op on a delete is worse than a refusal: a refusal is a bug report.
 *
 *         Both halves are pinned here, because fixing one must not weaken the other:
 *           OPEN period      → a correction is permitted, and it ACTUALLY HAPPENS.
 *           SIGNED-OFF period → immutable. The delete RAISEs. (D-TRUST-01 / TRUST_ACCOUNT_POSITIONING §4:
 *                               correct a closed period with a contra entry, never by rewriting history.)
 */
import { describe, it, expect, afterAll } from "vitest"
import { svc, seedLedgerCase, teardownOrg, type SeededCase } from "@/test/db/tier"

const db = svc()
const orgs: string[] = []

afterAll(() => {
  for (const orgId of orgs.splice(0)) teardownOrg(orgId)
})

const STATEMENT_MONTH = "2026-06-01"

async function seedTrustTxn(c: SeededCase): Promise<string> {
  const { data, error } = await db.from("trust_transactions").insert({
    org_id: c.orgId,
    lease_id: c.leaseId,
    transaction_type: "deposit_received",
    direction: "credit",
    amount_cents: 100_000,
    description: "immutability probe",
    initiated_by: "agent",
    statement_month: STATEMENT_MONTH,
  }).select("id").single()
  if (error) throw new Error(`seedTrustTxn: ${error.message}`)
  return data.id as string
}

/** A signed-off recon period covering STATEMENT_MONTH — the thing that makes the ledger immutable. */
async function seedSignedOffPeriod(orgId: string): Promise<void> {
  const { data: acct, error: acctError } = await db.from("bank_accounts").insert({
    org_id: orgId, type: "trust", bank_name: "FNB", account_holder: "Test Trust",
  }).select("id").single()
  if (acctError) throw new Error(`seedSignedOffPeriod bank_accounts: ${acctError.message}`)

  const { error } = await db.from("trust_reconciliation_periods").insert({
    org_id: orgId,
    bank_account_id: acct.id,
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    bank_closing_balance_cents: 0,
    ledger_closing_balance_cents: 0,
    recon_computed_closing_cents: 0,
    status: "signed_off",
  })
  if (error) throw new Error(`seedSignedOffPeriod: ${error.message}`)
}

async function trustRowCount(orgId: string): Promise<number> {
  const { count, error } = await db
    .from("trust_transactions").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  if (error) throw new Error(`trustRowCount: ${error.message}`)
  return count ?? 0
}

describe("trust ledger immutability — the guard, and the silent no-op it was hiding", () => {
  it("OPEN period: a delete is permitted AND ACTUALLY REMOVES THE ROW (it used to silently no-op)", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)

    const id = await seedTrustTxn(c)
    expect(await trustRowCount(c.orgId)).toBe(1)

    const { error } = await db.from("trust_transactions").delete().eq("id", id).eq("org_id", c.orgId)
    expect(error, "no signed-off period ⇒ the correction is allowed").toBeFalsy()

    // The load-bearing assertion. The old trigger returned NEW (NULL on DELETE), which cancels the row — so
    // this DELETE "succeeded" and the row stayed. The caller was told it had worked. It had not.
    expect(await trustRowCount(c.orgId), "the row is GONE, not merely reported gone").toBe(0)
  })

  it("SIGNED-OFF period: the row is immutable — the delete RAISEs, and the row survives", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)

    const id = await seedTrustTxn(c)

    await seedSignedOffPeriod(c.orgId)

    const { error } = await db.from("trust_transactions").delete().eq("id", id).eq("org_id", c.orgId)

    // Loud, not silent. This is the invariant the fix must not weaken: a signed-off period is history, and
    // history is corrected with a contra entry in the open period — never by rewriting it.
    expect(error, "a signed-off trust period must REFUSE the delete").toBeTruthy()
    expect(error?.message).toContain("SOVEREIGN_TRUST_VIOLATION")

    expect(await trustRowCount(c.orgId), "and the row is still there").toBe(1)
  })

  it("SIGNED-OFF period: an UPDATE is refused too (the guard covers both verbs)", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)

    const id = await seedTrustTxn(c)
    await seedSignedOffPeriod(c.orgId)

    const { error } = await db
      .from("trust_transactions").update({ amount_cents: 1 }).eq("id", id).eq("org_id", c.orgId)
    expect(error, "history cannot be rewritten").toBeTruthy()
    expect(error?.message).toContain("SOVEREIGN_TRUST_VIOLATION")
  })
})
