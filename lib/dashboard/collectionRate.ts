/**
 * lib/dashboard/collectionRate.ts — current-month rent collection summary for the dashboard Financials panel
 *
 * Auth:   service client (getCachedServiceClient); org-scoped by org_id.
 * Data:   rent_invoices for the current calendar month (expected vs collected) + active-lease rent roll.
 * Notes:  Month bounds are plain YYYY-MM-DD strings, NOT new Date().toISOString() — the latter shifts the
 *         month-end back a day on UTC+ timezones (e.g. SA dev = UTC+2 → "29th 22:00Z"), which silently
 *         excluded month-end invoices and zeroed the panel. Date strings compare cleanly to the date columns.
 */
import { getCachedServiceClient } from "@/lib/supabase/server"

export interface CollectionRateData {
  totalExpected: number
  totalCollected: number
  collectionRate: number
  totalRentRoll: number
}

export async function getCollectionRate(orgId: string): Promise<CollectionRateData> {
  const supabase = await getCachedServiceClient()
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed
  const mm = String(m + 1).padStart(2, "0")
  const lastDay = new Date(y, m + 1, 0).getDate()
  const monthStart = `${y}-${mm}-01`
  const monthEnd = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`

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

  if (invoicesRes.error) console.error("getCollectionRate invoices:", invoicesRes.error.message)
  if (leaseRentsRes.error) console.error("getCollectionRate leases:", leaseRentsRes.error.message)

  const invoices = invoicesRes.data ?? []
  const totalExpected = invoices.reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
  const totalCollected = invoices.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0)
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0
  const totalRentRoll = (leaseRentsRes.data ?? []).reduce((s, l) => s + (l.rent_amount_cents ?? 0), 0)

  return { totalExpected, totalCollected, collectionRate, totalRentRoll }
}
