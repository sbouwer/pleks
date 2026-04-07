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

  // Get management fee invoices for this month
  const { data: feeInvoices } = await supabase
    .from("management_fee_invoices")
    .select("fee_amount_cents, vat_amount_cents, total_cents, gross_rent_collected_cents, fee_percent")
    .eq("org_id", orgId)
    .gte("period_month", monthStr)
    .lte("period_month", monthEnd.toISOString())

  const fees = feeInvoices ?? []
  const totalFees = fees.reduce((s, f) => s + (f.total_cents ?? 0), 0)
  const feePercent = fees[0]?.fee_percent ?? 10

  // Calculate how much rent has been collected (covers fees) vs not
  const { data: invoices } = await supabase
    .from("rent_invoices")
    .select("total_amount_cents, amount_paid_cents")
    .eq("org_id", orgId)
    .gte("period_from", monthStr)
    .lte("period_to", monthEnd.toISOString())

  const allInvoices = invoices ?? []
  const totalExpected = allInvoices.reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
  const totalCollected = allInvoices.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0)

  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0
  const feesInCollected = Math.round(totalFees * collectionRate)
  const feesInUncollected = totalFees - feesInCollected

  const periodLabel = now.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })

  return {
    total_fees_due_cents: totalFees,
    fees_in_collected_rent: feesInCollected,
    fees_in_uncollected_rent: feesInUncollected,
    fee_percent: feePercent,
    period_label: periodLabel,
  }
}
