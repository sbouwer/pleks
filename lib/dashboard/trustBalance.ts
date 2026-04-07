import { getCachedServiceClient } from "@/lib/supabase/server"

export interface TrustBalanceSummary {
  total_in_trust_cents: number
  rent_collected_undisbursed_cents: number
  deposits_held_cents: number
  management_fees_pending_cents: number
  last_recon_date: string | null
}

export async function getTrustBalance(orgId: string): Promise<TrustBalanceSummary> {
  const supabase = await getCachedServiceClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // All 4 queries in parallel — none depends on the others
  const [transactionsRes, unpaidStatementsRes, unreleasedFeesRes, lastReconRes] = await Promise.all([
    supabase
      .from("trust_transactions")
      .select("transaction_type, direction, amount_cents")
      .eq("org_id", orgId),
    supabase
      .from("owner_statements")
      .select("net_to_owner_cents")
      .eq("org_id", orgId)
      .gte("period_from", monthStart.toISOString())
      .in("owner_payment_status", ["pending", "on_hold"]),
    supabase
      .from("management_fee_invoices")
      .select("total_cents")
      .eq("org_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("bank_recon_sessions")
      .select("period_end")
      .eq("org_id", orgId)
      .eq("status", "signed_off")
      .order("period_end", { ascending: false })
      .limit(1),
  ])

  let totalIn = 0
  let totalOut = 0
  let depositsIn = 0
  let depositsOut = 0

  for (const t of transactionsRes.data ?? []) {
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

  return {
    total_in_trust_cents: totalIn - totalOut,
    rent_collected_undisbursed_cents: (unpaidStatementsRes.data ?? []).reduce((s, st) => s + (st.net_to_owner_cents ?? 0), 0),
    deposits_held_cents: depositsIn - depositsOut,
    management_fees_pending_cents: (unreleasedFeesRes.data ?? []).reduce((s, f) => s + (f.total_cents ?? 0), 0),
    last_recon_date: lastReconRes.data?.[0]?.period_end ?? null,
  }
}
