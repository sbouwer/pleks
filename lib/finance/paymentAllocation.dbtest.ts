/**
 * lib/finance/paymentAllocation.dbtest.ts — recordPayment money-path regression guard
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Data:   drives the REAL record_payment_atomic() RPC — which now runs the clause-6.6 allocation
 *         INSIDE the transaction (allocate_payment_atomic). This is exactly the fixed recordPayment
 *         path (lib/actions/payments.ts): one atomic RPC, no post-commit allocatePayment(). No mocks.
 * Notes:  Two invariants:
 *           1. Conservation (ledgerInvariant): balanceReduction + interestWaived + surplus == payment.
 *              Catches the double-count — the pre-fold-in code settled MORE than the payment's value.
 *           2. Placement (canonical case): clause 6.6 mandates a specific order — interest first, then
 *              OLDEST rent. Conservation alone can't catch mis-ordering, so the canonical case also
 *              asserts WHERE the money landed. All five cases must be green post-fold-in.
 */
import { describe, it, expect, afterEach } from "vitest"
import { svc, seedLedgerCase, teardownOrg, ledgerInvariant, type SeededCase } from "@/test/db/tier"

const db = svc()

/** Fixed recordPayment path: the atomic RPC allocates internally — nothing else to call. */
async function recordViaRpc(seeded: SeededCase, targetKey: string, amountCents: number): Promise<string> {
  const target = seeded.invoices[targetKey]
  const { data: paymentId, error } = await db.rpc("record_payment_atomic", {
    p_org_id: seeded.orgId,
    p_invoice_id: target.id,
    p_amount_cents: amountCents,
    p_payment_date: "2026-07-05",
    p_method: "eft",
    p_reference: "TEST-REF",
    p_recorded_by: null,
    p_receipt_number: `REC-TEST-${target.id.slice(0, 8)}`,
    p_notes: null,
  })
  if (error || !paymentId) throw new Error(`record_payment_atomic failed: ${error?.message ?? "no id"}`)
  return paymentId as string
}

async function balanceOf(invoiceId: string): Promise<number> {
  const { data, error } = await db.from("rent_invoices").select("balance_cents").eq("id", invoiceId).single()
  if (error) throw new Error(`balanceOf: ${error.message}`)
  return data.balance_cents ?? 0
}

describe("recordPayment money path — record_payment_atomic (clause-6.6 allocation folded in)", () => {
  const seededOrgs: string[] = []
  afterEach(() => {
    for (const orgId of seededOrgs.splice(0)) teardownOrg(orgId)
  })

  it("single invoice, exact pay — settles exactly the invoice", async () => {
    const s = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    seededOrgs.push(s.orgId)
    const pid = await recordViaRpc(s, "X", 100_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
    expect(await balanceOf(s.invoices["X"].id)).toBe(0)
  })

  it("single invoice, overpay — invoice cleared, remainder recorded as surplus", async () => {
    const s = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    seededOrgs.push(s.orgId)
    const pid = await recordViaRpc(s, "X", 150_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
    expect(await balanceOf(s.invoices["X"].id)).toBe(0)
    expect(inv.surplusCents).toBe(50_000)
  })

  it("partial pay on the target — reduces the target by exactly the payment", async () => {
    const s = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    seededOrgs.push(s.orgId)
    const pid = await recordViaRpc(s, "X", 60_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
    expect(await balanceOf(s.invoices["X"].id)).toBe(40_000) // R400 left, not double-reduced to 0
  })

  it("interest present — interest consumed first, remainder to the invoice", async () => {
    const s = await seedLedgerCase(db, {
      invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }],
      interest: [{ interestCents: 10_000, chargeOffsetDays: -10 }],
    })
    seededOrgs.push(s.orgId)
    const pid = await recordViaRpc(s, "X", 100_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
    expect(inv.interestWaivedCents).toBe(10_000)                 // R100 interest first
    expect(await balanceOf(s.invoices["X"].id)).toBe(10_000)     // R900 to X, R100 left
  })

  it("CANONICAL: older invoice + interest — clause-6.6 placement (interest → oldest rent → target)", async () => {
    // Pay R1000 against current invoice X. Older W (R400) open; R100 interest outstanding.
    // Clause 6.6: R100 interest → R400 W (oldest) → R500 X. X keeps R500. Total settled == R1000.
    const s = await seedLedgerCase(db, {
      invoices: [
        { key: "W", totalCents: 40_000, dueOffsetDays: -30 }, // oldest — allocated before X
        { key: "X", totalCents: 100_000, dueOffsetDays: 0 }, // the payment is recorded against this
      ],
      interest: [{ interestCents: 10_000, chargeOffsetDays: -20 }],
    })
    seededOrgs.push(s.orgId)
    const pid = await recordViaRpc(s, "X", 100_000)
    const inv = await ledgerInvariant(db, s, pid)
    // Conservation: R1000 settles exactly R1000 of obligations.
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
    // Placement: interest fully waived, W (oldest) fully paid, X reduced by only the R500 remainder.
    expect(inv.interestWaivedCents).toBe(10_000)
    expect(await balanceOf(s.invoices["W"].id)).toBe(0)
    expect(await balanceOf(s.invoices["X"].id)).toBe(50_000)
    expect(inv.surplusCents).toBe(0)
  })
})
