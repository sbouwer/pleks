import { getCachedServiceClient } from "@/lib/supabase/server"

export interface FeesDueWidget {
  total_fees_due_cents: number
  fees_in_collected_rent: number
  fees_in_uncollected_rent: number
  fee_percent: number
  period_label: string
}

export async function getFeesDue(orgId: string): Promise<FeesDueWidget> {
  const supabase = await getCachedServiceClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const monthStr = monthStart.toISOString()
  const monthEndStr = monthEnd.toISOString()

  // Both queries are independent — run in parallel
  const [feeInvoicesRes, invoicesRes] = await Promise.all([
    supabase
      .from("management_fee_invoices")
      .select("fee_amount_cents, vat_amount_cents, total_cents, gross_rent_collected_cents, fee_percent")
      .eq("org_id", orgId)
      .gte("period_month", monthStr)
      .lte("period_month", monthEndStr),
    supabase
      .from("rent_invoices")
      .select("total_amount_cents, amount_paid_cents")
      .eq("org_id", orgId)
      .gte("period_from", monthStr)
      .lte("period_to", monthEndStr),
  ])

  const fees = feeInvoicesRes.data ?? []
  const totalFees = fees.reduce((s, f) => s + (f.total_cents ?? 0), 0)
  const feePercent = fees[0]?.fee_percent ?? 10

  const allInvoices = invoicesRes.data ?? []
  const totalExpected = allInvoices.reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
  const totalCollected = allInvoices.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0)

  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0
  const feesInCollected = Math.round(totalFees * collectionRate)

  return {
    total_fees_due_cents: totalFees,
    fees_in_collected_rent: feesInCollected,
    fees_in_uncollected_rent: totalFees - feesInCollected,
    fee_percent: feePercent,
    period_label: now.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
  }
}
