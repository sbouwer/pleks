import { createServiceClient } from "@/lib/supabase/server"

export interface TrustBalanceSummary {
  total_in_trust_cents: number
  rent_collected_undisbursed_cents: number
  deposits_held_cents: number
  management_fees_pending_cents: number
  last_recon_date: string | null
}

export async function getTrustBalance(orgId: string): Promise<TrustBalanceSummary> {
  const supabase = await createServiceClient()

  // Sum all trust transactions by type
  const { data: transactions } = await supabase
    .from("trust_transactions")
    .select("transaction_type, direction, amount_cents")
    .eq("org_id", orgId)

  let totalIn = 0
  let totalOut = 0
  let depositsIn = 0
  let depositsOut = 0

  for (const t of transactions ?? []) {
    const amount = t.amount_cents ?? 0
    if (t.direction === "credit") {
      totalIn += amount
      if (t.transaction_type === "deposit_received") depositsIn += amount
    } else {
      totalOut += amount
      if (t.transaction_type === "deposit_refund" || t.transaction_type === "deposit_deduction") {
        depositsOut += amount
      }
    }
  }

  const depositsHeld = depositsIn - depositsOut
  const totalBalance = totalIn - totalOut

  // Get unpaid owner statements this month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const { data: unpaidStatements } = await supabase
    .from("owner_statements")
    .select("net_to_owner_cents")
    .eq("org_id", orgId)
    .gte("period_from", monthStart.toISOString())
    .in("owner_payment_status", ["pending", "on_hold"])

  const undisbursed = (unpaidStatements ?? []).reduce((s, st) => s + (st.net_to_owner_cents ?? 0), 0)

  // Get unreleased management fees
  const { data: unreleasedFees } = await supabase
    .from("management_fee_invoices")
    .select("total_cents")
    .eq("org_id", orgId)
    .eq("status", "pending")

  const pendingFees = (unreleasedFees ?? []).reduce((s, f) => s + (f.total_cents ?? 0), 0)

  // Last bank recon date
  const { data: lastRecon } = await supabase
    .from("bank_recon_sessions")
    .select("period_end")
    .eq("org_id", orgId)
    .eq("status", "signed_off")
    .order("period_end", { ascending: false })
    .limit(1)

  return {
    total_in_trust_cents: totalBalance,
    rent_collected_undisbursed_cents: undisbursed,
    deposits_held_cents: depositsHeld,
    management_fees_pending_cents: pendingFees,
    last_recon_date: lastRecon?.[0]?.period_end ?? null,
  }
}
