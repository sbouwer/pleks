import { toDateStr } from "./periods"
import { createServiceClient } from "@/lib/supabase/server"
import type { TrustReconciliationData, TrustReconRow, ReportFilters } from "./types"

export async function buildTrustReconciliation(filters: ReportFilters): Promise<TrustReconciliationData> {
  const db = await createServiceClient()
  const { orgId, from, to } = filters

  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

  // All trust transactions in period
  const { data, error } = await db
    .from("trust_transactions")
    .select("id, transaction_type, direction, amount_cents, description, reference, created_at")
    .eq("org_id", orgId)
    .gte("created_at", fromStr)
    .lte("created_at", toStr)
    .order("created_at", { ascending: true })

  if (error) console.error("trustReconciliation:", error.message)

  // Opening balance: all transactions before period
  const { data: priorData } = await db
    .from("trust_transactions")
    .select("direction, amount_cents")
    .eq("org_id", orgId)
    .lt("created_at", fromStr)

  const openingBalance = (priorData ?? []).reduce(
    (s, t) => s + (t.direction === "credit" ? (t.amount_cents ?? 0) : -(t.amount_cents ?? 0)),
    0,
  )

  const txns = data ?? []
  const rows: TrustReconRow[] = txns.map((t) => ({
    date: (t.created_at as string).slice(0, 10),
    description: (t.description as string) ?? t.transaction_type,
    type: t.transaction_type as string,
    credit_cents: t.direction === "credit" ? (t.amount_cents as number) : 0,
    debit_cents: t.direction === "debit" ? (t.amount_cents as number) : 0,
    reference: (t.reference as string | null) ?? null,
  }))

  const totalCredits = rows.reduce((s, r) => s + r.credit_cents, 0)
  const totalDebits = rows.reduce((s, r) => s + r.debit_cents, 0)

  return {
    period: { from, to },
    opening_balance_cents: openingBalance,
    closing_balance_cents: openingBalance + totalCredits - totalDebits,
    total_credits_cents: totalCredits,
    total_debits_cents: totalDebits,
    rows,
  }
}
