import { getCachedServiceClient } from "@/lib/supabase/server"

export interface ExpiringLease {
  id: string
  unitLabel: string
  tenantName: string
  dateRange: string
  progressPercent: number
  daysRemaining: number
  isExpired: boolean
  dotColor: string
  barColor: string
  cpaDue: boolean
}

export async function getExpiringLeases(orgId: string): Promise<ExpiringLease[]> {
  const supabase = await getCachedServiceClient()
  const now = new Date()
  const twelveMonthsOut = new Date(now)
  twelveMonthsOut.setMonth(twelveMonthsOut.getMonth() + 12)

  const { data: leases } = await supabase
    .from("leases")
    .select(`
      id, start_date, end_date, status, cpa_applies, auto_renewal_notice_sent_at,
      units(unit_number, properties(name)),
      tenants(contacts(first_name, last_name, company_name))
    `)
    .eq("org_id", orgId)
    .in("status", ["active", "notice", "month_to_month"])
    .is("deleted_at", null)
    .lte("end_date", twelveMonthsOut.toISOString())
    .order("end_date", { ascending: true })
    .limit(8)

  const sixtyDaysOut = new Date(now)
  sixtyDaysOut.setDate(now.getDate() + 60)

  return (leases ?? []).map((l) => {
    const unit = l.units as unknown as { unit_number: string; properties: { name: string } } | null
    const tenant = l.tenants as unknown as {
      contacts: { first_name: string; last_name: string; company_name: string | null }
    } | null

    const unitLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const tenantName = tenant?.contacts?.company_name
      ?? (tenant?.contacts
        ? `${tenant.contacts.first_name[0]}. ${tenant.contacts.last_name}`.trim()
        : "Unknown")

    const start = new Date(l.start_date)
    const end = new Date(l.end_date)
    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000)
    const elapsed = Math.max(0, (now.getTime() - start.getTime()) / 86400000)
    const progressPercent = Math.min(100, Math.round((elapsed / totalDays) * 100))
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
    const isExpired = end < now

    const color =
      isExpired || daysRemaining < 30 ? "#E24B4A"
      : daysRemaining < 90 ? "#EF9F27"
      : "#378ADD"

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })

    const cpaDue =
      l.cpa_applies === true &&
      !l.auto_renewal_notice_sent_at &&
      end <= sixtyDaysOut

    return {
      id: l.id,
      unitLabel,
      tenantName,
      dateRange: `${fmt(start)} → ${fmt(end)}`,
      progressPercent,
      daysRemaining,
      isExpired,
      dotColor: color,
      barColor: color,
      cpaDue,
    }
  })
}
