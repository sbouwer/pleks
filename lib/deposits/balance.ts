/**
 * lib/deposits/balance.ts — derives deposit balance, amount paid, and accrued interest for a lease from its transactions
 *
 * Data:   deposit_transactions (via service client)
 * Notes:  Balance = sum of credits minus debits. Caller is responsible for org scoping.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function getDepositBalance(leaseId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { data, error: queryError } = await supabase
    .from("deposit_transactions")
    .select("direction, amount_cents")
    .eq("lease_id", leaseId)
    logQueryError("getDepositBalance deposit_transactions", queryError)

  return (data ?? []).reduce((sum, txn) => {
    return txn.direction === "credit"
      ? sum + txn.amount_cents
      : sum - txn.amount_cents
  }, 0)
}

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
