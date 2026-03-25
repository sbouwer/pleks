import { createServiceClient } from "@/lib/supabase/server"

export async function getDepositBalance(leaseId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("deposit_transactions")
    .select("direction, amount_cents")
    .eq("lease_id", leaseId)

  return (data ?? []).reduce((sum, txn) => {
    return txn.direction === "credit"
      ? sum + txn.amount_cents
      : sum - txn.amount_cents
  }, 0)
}

export async function getDepositPaid(leaseId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("deposit_transactions")
    .select("amount_cents")
    .eq("lease_id", leaseId)
    .eq("transaction_type", "deposit_received")

  return (data ?? []).reduce((sum, txn) => sum + txn.amount_cents, 0)
}

export async function getTotalInterestAccrued(leaseId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("deposit_transactions")
    .select("amount_cents")
    .eq("lease_id", leaseId)
    .eq("transaction_type", "interest_accrued")

  return (data ?? []).reduce((sum, txn) => sum + txn.amount_cents, 0)
}
