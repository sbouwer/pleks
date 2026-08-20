/**
 * lib/deposits/balance.ts — derives amount paid and accrued interest for a lease from its deposit transactions
 *
 * Data:   deposit_transactions (via service client)
 * Notes:  Caller is responsible for org scoping. getDepositBalance (credits minus debits) was
 *         removed 2026-08-20 as a dead export — no caller computes a net balance here any more.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function getDepositPaid(leaseId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { data, error: queryError } = await supabase
    .from("deposit_transactions")
    .select("amount_cents")
    .eq("lease_id", leaseId)
    .eq("transaction_type", "deposit_received")
    logQueryError("getDepositPaid deposit_transactions", queryError)

  return (data ?? []).reduce((sum, txn) => sum + txn.amount_cents, 0)
}

export async function getTotalInterestAccrued(leaseId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { data, error: queryError } = await supabase
    .from("deposit_transactions")
    .select("amount_cents")
    .eq("lease_id", leaseId)
    .eq("transaction_type", "interest_accrued")
    logQueryError("getTotalInterestAccrued deposit_transactions", queryError)

  return (data ?? []).reduce((sum, txn) => sum + txn.amount_cents, 0)
}
