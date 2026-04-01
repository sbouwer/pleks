import { createServiceClient } from "@/lib/supabase/server"

export interface CollectionRateData {
  totalExpected: number
  totalCollected: number
  collectionRate: number
  totalRentRoll: number
}

export async function getCollectionRate(orgId: string): Promise<CollectionRateData> {
  const supabase = await createServiceClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  const [invoicesRes, leaseRentsRes] = await Promise.all([
    supabase
      .from("rent_invoices")
      .select("total_amount_cents, amount_paid_cents")
      .eq("org_id", orgId)
      .gte("period_from", monthStart)
      .lte("period_to", monthEnd),
    supabase
      .from("leases")
      .select("rent_amount_cents")
      .eq("org_id", orgId)
      .in("status", ["active", "notice", "month_to_month"])
      .is("deleted_at", null),
  ])

  const invoices = invoicesRes.data ?? []
  const totalExpected = invoices.reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
  const totalCollected = invoices.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0)
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0
  const totalRentRoll = (leaseRentsRes.data ?? []).reduce((s, l) => s + (l.rent_amount_cents ?? 0), 0)

  return { totalExpected, totalCollected, collectionRate, totalRentRoll }
}
