/**
 * lib/deposits/depositReceipt.ts — has a lease's deposit been received, and when: read across BOTH ledgers that record it
 *
 * Auth:   Server-only; the caller's client, org-scoped here
 * Data:   deposit_transactions + trust_transactions (transaction_type 'deposit_received')
 * Notes:  "A deposit exists" has three writers over two ledgers: the agent's tick and depositImport post through
 *         record_deposit_atomic (both ledgers), but the TPN GL import posts to trust_transactions only. A reader of
 *         one ledger offered to record a GL-imported deposit a second time. Since 2026-10-09 (Stéan) a deposit is
 *         on the ledger only once an agent ticks it received, so "active lease with a deposit amount" no longer
 *         implies one was received — every reader that needs that fact asks here.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type DepositReceipt = { ok: true; receivedAt: string | null } | { ok: false; error: string }

/** The earliest deposit_received on either ledger, or null when neither holds one. Fails closed: an unread
 *  ledger is an error, never "not received" — that answer would offer to post the money twice. */
export async function depositReceipt(db: SupabaseClient, leaseId: string, orgId: string): Promise<DepositReceipt> {
  const [deposit, trust] = await Promise.all([
    db.from("deposit_transactions").select("created_at").eq("lease_id", leaseId).eq("org_id", orgId)
      .eq("transaction_type", "deposit_received").order("created_at", { ascending: true }).limit(1),
    db.from("trust_transactions").select("created_at").eq("lease_id", leaseId).eq("org_id", orgId)
      .eq("transaction_type", "deposit_received").order("created_at", { ascending: true }).limit(1),
  ])
  if (deposit.error) return { ok: false, error: deposit.error.message }
  if (trust.error) return { ok: false, error: trust.error.message }
  const dates = [deposit.data?.[0]?.created_at, trust.data?.[0]?.created_at].filter((d): d is string => !!d).sort()
  return { ok: true, receivedAt: dates[0] ?? null }
}

/** Where interest starts when no accrual has run yet. A migrated lease's receipt is dated the day it was imported,
 *  not the day the money arrived, so it keeps the lease start; otherwise interest runs from the later of the lease
 *  start and the receipt. */
export function interestStartDate(lease: { start_date: string; migrated: boolean | null }, receivedAt: string): string {
  if (lease.migrated) return lease.start_date
  const receivedDay = receivedAt.slice(0, 10)
  return receivedDay > lease.start_date ? receivedDay : lease.start_date
}
