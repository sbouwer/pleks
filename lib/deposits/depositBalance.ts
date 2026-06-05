/**
 * lib/deposits/depositBalance.ts — tenant deposit balance (computed, never a stored column)
 *
 * Auth:   service client passed in; always org-scoped
 * Data:   deposit_transactions (movement ledger: amount_cents + direction) + deposit_reconciliations
 *         (computed end-state). ADDENDUM_PHANTOM_COLUMN_TAIL D-2.
 * Notes:  deposit_transactions has NO balance/credit/debit columns — those were phantom reads.
 *         `direction` ('credit'|'debit') IS the sign; transaction_type is the reason, not the sign
 *         (verified against the live CHECK constraints). Held balance = credits in − debits out.
 */
import type { createServiceClient } from "@/lib/supabase/server"

type Service = Awaited<ReturnType<typeof createServiceClient>>

/** Signed sum of the movement ledger: credit = +amount, debit = −amount. Pure (unit-tested). */
export function depositSignedSum(txns: ReadonlyArray<{ amount_cents: number; direction: string }>): number {
  return txns.reduce((bal, t) => bal + (t.direction === "credit" ? t.amount_cents : -t.amount_cents), 0)
}

// Once a reconciliation reaches a terminal state it is the Tribunal record of truth — use its figure,
// not an ad-hoc ledger sum.
const RECONCILED_STATUSES = new Set(["finalised", "refunded"])

/**
 * Tenant-facing deposit balance: the authoritative reconciliation figure once reconciled, otherwise the
 * live held balance (signed sum of the movement ledger). Zero transactions → 0 (never throws).
 */
export async function computeDepositBalance(service: Service, orgId: string, leaseId: string): Promise<number> {
  const { data: recon, error: reconErr } = await service
    .from("deposit_reconciliations")
    .select("refund_to_tenant_cents, status")
    .eq("org_id", orgId)
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (reconErr) console.error("computeDepositBalance reconciliation:", reconErr.message)
  if (recon && RECONCILED_STATUSES.has(recon.status as string)) {
    return (recon.refund_to_tenant_cents as number | null) ?? 0
  }

  const { data: txns, error: txnErr } = await service
    .from("deposit_transactions")
    .select("amount_cents, direction")
    .eq("org_id", orgId)
    .eq("lease_id", leaseId)
  if (txnErr) console.error("computeDepositBalance transactions:", txnErr.message)
  return depositSignedSum((txns ?? []) as { amount_cents: number; direction: string }[])
}
