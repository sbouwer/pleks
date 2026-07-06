/**
 * lib/finance/paymentAllocation.dbtest.ts — characterization of the recordPayment money path
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Data:   drives the REAL record_payment_atomic() RPC + the REAL allocatePayment() in sequence —
 *         exactly what lib/actions/payments.ts:recordPayment does (RPC at :57, allocate at :84),
 *         minus the auth gate. No mocks: this pins the LIVE double-count against a real Postgres.
 * Notes:  Invariant (see tier.ledgerInvariant): balanceReduction + interestWaived + surplus == payment.
 *         The RPC credits the TARGET invoice in full; allocatePayment then RE-spreads the same amount
 *         interest-first/oldest-first — so any case where allocate still finds something to apply
 *         (older invoice, interest, or a partially-paid target) settles MORE than the payment's value.
 *         This file is RED today for partial / interest-only / multi-invoice+interest, GREEN for the
 *         two cases where the RPC leaves nothing for allocate to touch. The clause-6.6 fold-in
 *         (allocate once, inside the RPC) must turn the whole battery green.
 */
import { describe, it, expect, afterEach } from "vitest"
import { allocatePayment } from "./paymentAllocation"
import { svc, seedLedgerCase, teardownOrg, ledgerInvariant, type SeededCase } from "@/test/db/tier"

const db = svc()

/** Reproduce recordPayment's post-commit sequence: atomic RPC, then interest-first allocation. */
async function recordAndAllocate(seeded: SeededCase, targetKey: string, amountCents: number): Promise<string> {
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
  // The exact production call (lib/actions/payments.ts:84) — full amount, re-spread interest-first.
  await allocatePayment(paymentId as string, seeded.leaseId, amountCents, null)
  return paymentId as string
}

describe("recordPayment money path — record_payment_atomic + allocatePayment", () => {
  const seededOrgs: string[] = []
  afterEach(() => {
    for (const orgId of seededOrgs.splice(0)) teardownOrg(orgId)
  })

  it("single invoice, exact pay — GREEN (RPC pays it in full, allocate finds nothing)", async () => {
    const s = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    seededOrgs.push(s.orgId)
    const pid = await recordAndAllocate(s, "X", 100_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
  })

  it("single invoice, overpay — GREEN (target fully paid, surplus captured, allocate finds nothing)", async () => {
    const s = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    seededOrgs.push(s.orgId)
    const pid = await recordAndAllocate(s, "X", 150_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
  })

  it("partial pay on the target — RED (RPC leaves it 'partial', allocate re-applies to it)", async () => {
    const s = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    seededOrgs.push(s.orgId)
    const pid = await recordAndAllocate(s, "X", 60_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
  })

  it("interest present — RED (RPC pays target, allocate additionally consumes interest)", async () => {
    const s = await seedLedgerCase(db, {
      invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }],
      interest: [{ interestCents: 10_000, chargeOffsetDays: -10 }],
    })
    seededOrgs.push(s.orgId)
    const pid = await recordAndAllocate(s, "X", 100_000)
    const inv = await ledgerInvariant(db, s, pid)
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
  })

  it("CANONICAL: older invoice + interest — RED (payment settles X in full AND W AND interest)", async () => {
    // Pay R1000 against current invoice X. Older W (R400) is open; R100 interest outstanding.
    // Correct clause-6.6: R100 interest → R400 W → R500 X (X keeps R500 balance). Total settled = R1000.
    // Buggy: RPC pays X in full (R1000) + allocate consumes R100 interest + R400 W = R1500 settled.
    const s = await seedLedgerCase(db, {
      invoices: [
        { key: "W", totalCents: 40_000, dueOffsetDays: -30 }, // older, oldest-first target of allocate
        { key: "X", totalCents: 100_000, dueOffsetDays: 0 }, // current — the payment is recorded against this
      ],
      interest: [{ interestCents: 10_000, chargeOffsetDays: -20 }],
    })
    seededOrgs.push(s.orgId)
    const pid = await recordAndAllocate(s, "X", 100_000)
    const inv = await ledgerInvariant(db, s, pid)
    // Whole-payment invariant: the R1000 must not settle more than R1000 of obligations.
    expect(inv.lhs, JSON.stringify(inv)).toBe(inv.paymentAmountCents)
  })
})
