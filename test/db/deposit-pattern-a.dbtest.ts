/**
 * test/db/deposit-pattern-a.dbtest.ts — Pattern A settlement atomicity + closed-period guard (ledger finale)
 *
 * Auth:   local Supabase service client — DB-integration tier (npm run test:db).
 * Data:   settle_deposit_charge_pattern_a_atomic + settle_deposit_charge_atomic + allocate_payment_atomic
 *         over payments / rent_invoices / deposit_transactions / trust_transactions / deposit_charges /
 *         trust_reconciliation_periods.
 * Notes:  (1) Pattern A folds payment + clause-6.6 allocation + deposit debit + charge link into one tx — a
 *         forced trust failure rolls the payment AND the charge link back (was a re-run double-consume gap).
 *         (2) Deposit trust postings now carry statement_month, so posting into a SIGNED-OFF period RAISEs +
 *         rolls back instead of silently corrupting closed books.
 */
import { afterAll, describe, expect, it } from "vitest"
import { svc, seedLedgerCase, teardownOrg, forceDepositTxnInsertFailure } from "./tier"
import { saTodayISO, addCalendarDays, addCalendarMonths } from "@/lib/dates"

const db = svc()
const orgs: string[] = []
afterAll(() => orgs.forEach(teardownOrg))

const AMOUNT = 50000

async function seedCharge(c: { orgId: string; leaseId: string }): Promise<string> {
  const { data, error } = await db.from("deposit_charges").insert({
    org_id: c.orgId, lease_id: c.leaseId, charge_type: "rent_arrears",
    description: "arrears offset", deduction_amount_cents: AMOUNT, agent_confirmed: true,
  }).select("id").single()
  if (error) throw error
  return data!.id as string
}
async function invoiceBalance(id: string): Promise<number> {
  const { data, error } = await db.from("rent_invoices").select("balance_cents").eq("id", id).single()
  if (error) throw error
  return (data?.balance_cents as number) ?? -1
}
async function paymentCount(leaseId: string): Promise<number> {
  const { count } = await db.from("payments").select("id", { count: "exact", head: true }).eq("lease_id", leaseId)
  return count ?? 0
}
async function depTxnCount(leaseId: string): Promise<number> {
  const { count } = await db.from("deposit_transactions").select("id", { count: "exact", head: true }).eq("lease_id", leaseId)
  return count ?? 0
}
async function chargeLinks(chargeId: string): Promise<{ pay: string | null; dep: string | null }> {
  const { data, error } = await db.from("deposit_charges").select("settling_payment_id, settling_deposit_txn_id").eq("id", chargeId).single()
  if (error) throw error
  return { pay: (data?.settling_payment_id as string | null) ?? null, dep: (data?.settling_deposit_txn_id as string | null) ?? null }
}
function patternA(c: { orgId: string; leaseId: string; tenantId: string }, chargeId: string) {
  return db.rpc("settle_deposit_charge_pattern_a_atomic", {
    p_org_id: c.orgId, p_lease_id: c.leaseId, p_tenant_id: c.tenantId, p_charge_id: chargeId,
    p_amount_cents: AMOUNT, p_description: "arrears offset", p_actor: null, p_arrears_case_id: null,
  })
}

describe("deposit Pattern A + closed-period guard (ledger finale)", () => {
  it("Pattern A: payment + clause-6.6 allocation + deposit debit + charge link commit together", async () => {
    const c = await seedLedgerCase(db, { invoices: [{ key: "a", totalCents: AMOUNT, dueOffsetDays: -10 }] })
    orgs.push(c.orgId)
    const chargeId = await seedCharge(c)

    const r = await patternA(c, chargeId)
    expect(r.error).toBeNull()
    expect(await invoiceBalance(c.invoices.a.id)).toBe(0)   // R500 open invoice fully allocated
    expect(await paymentCount(c.leaseId)).toBe(1)
    expect(await depTxnCount(c.leaseId)).toBe(1)             // arrears_offset_to_invoice debit
    const links = await chargeLinks(chargeId)
    expect(links.pay).not.toBeNull()
    expect(links.dep).not.toBeNull()
  })

  it("Pattern A: a failed deposit_transactions insert rolls the payment + allocation + charge link back — no double-consume", async () => {
    const c = await seedLedgerCase(db, { invoices: [{ key: "a", totalCents: AMOUNT, dueOffsetDays: -10 }] })
    orgs.push(c.orgId)
    const chargeId = await seedCharge(c)

    // Pattern A posts no trust row (money moves deposit→invoice internally); force the deposit_transactions
    // step (which runs AFTER the payment + allocation) to fail — the whole settlement must roll back.
    forceDepositTxnInsertFailure(true)
    try {
      const r = await patternA(c, chargeId)
      expect(r.error).not.toBeNull()
    } finally {
      forceDepositTxnInsertFailure(false)
    }
    expect(await paymentCount(c.leaseId)).toBe(0)             // payment rolled back
    expect(await depTxnCount(c.leaseId)).toBe(0)
    expect(await invoiceBalance(c.invoices.a.id)).toBe(AMOUNT) // allocation reverted → re-run is safe
    expect((await chargeLinks(chargeId)).pay).toBeNull()
  })

  it("closed-period guard: a settlement into a SIGNED-OFF period RAISEs + rolls back (statement_month now set)", async () => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)
    const chargeId = await seedCharge(c)

    // Seed a bank account + a signed-off reconciliation period covering the current month.
    const { data: bank, error: bankErr } = await db.from("bank_accounts").insert({
      org_id: c.orgId, account_holder: "T", bank_name: "T", type: "trust",
    }).select("id").single()
    if (bankErr) throw bankErr
    // The period must be the SA CALENDAR month — the same month `date_trunc('month', CURRENT_DATE)` stamps on
    // the trust posting. The first version mixed frames: it set the day-of-month in UTC (`setUTCDate(1)`) and
    // then read the result back as an SA date. Between midnight and 02:00 SAST, UTC is still the previous day,
    // so `period_start` came out as the 2nd while `statement_month` was the 1st — the posting fell OUTSIDE the
    // period it was supposed to be blocked by, the guard correctly declined to fire, and the test failed. It
    // passed all day and failed at night. Pure string arithmetic on the SA calendar, via the dates SSOT, cannot
    // drift like that — which is exactly what `pleks/no-adhoc-dates` exists to enforce in prod code.
    const start = `${saTodayISO().slice(0, 7)}-01`
    const end = addCalendarDays(addCalendarMonths(start, 1), -1)
    const { error: perErr } = await db.from("trust_reconciliation_periods").insert({
      org_id: c.orgId, bank_account_id: bank!.id, period_start: start, period_end: end,
      bank_closing_balance_cents: 0, ledger_closing_balance_cents: 0, recon_computed_closing_cents: 0, status: "signed_off",
    })
    if (perErr) throw perErr

    // Pattern B settlement posts a trust deposit_deduction with statement_month = current month → guard fires.
    const r = await db.rpc("settle_deposit_charge_atomic", {
      p_org_id: c.orgId, p_lease_id: c.leaseId, p_tenant_id: c.tenantId, p_charge_id: chargeId,
      p_amount_cents: AMOUNT, p_dep_description: "recovery", p_actor: null,
      p_with_trust: true, p_trust_description: "recovery",
    })
    expect(r.error).not.toBeNull()
    expect((r.error?.message ?? "").toUpperCase()).toContain("SOVEREIGN_TRUST_VIOLATION")
    expect(await depTxnCount(c.leaseId)).toBe(0)            // deposit debit rolled back with the blocked trust post
    expect((await chargeLinks(chargeId)).dep).toBeNull()
  })
})
