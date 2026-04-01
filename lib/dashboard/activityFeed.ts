import { createServiceClient } from "@/lib/supabase/server"

export interface ActivityItem {
  id: string
  type: "payment" | "lease" | "maintenance" | "arrears"
  title: string
  subtitle: string
  timestamp: Date
  dotColor: string
  href?: string
}

export function relativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

export async function getActivityFeed(orgId: string): Promise<ActivityItem[]> {
  const supabase = await createServiceClient()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [
    { data: recentPayments },
    { data: recentLeaseEvents },
    { data: recentMaintenance },
    { data: recentArrearsActions },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select(`
        id, amount_cents, payment_date, payment_method,
        tenants(contacts(first_name, last_name)),
        leases(units(unit_number, properties(name)))
      `)
      .eq("org_id", orgId)
      .gte("payment_date", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("lease_lifecycle_events")
      .select(`
        id, event_type, description, created_at,
        leases(units(unit_number, properties(name)), tenants(contacts(first_name, last_name)))
      `)
      .eq("org_id", orgId)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("maintenance_requests")
      .select("id, title, status, updated_at, units(unit_number, properties(name))")
      .eq("org_id", orgId)
      .gte("updated_at", sevenDaysAgo.toISOString())
      .in("status", ["acknowledged", "in_progress", "pending_completion", "completed"])
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("arrears_actions")
      .select(`
        id, action_type, channel, subject, sent_at,
        arrears_cases(tenants(contacts(first_name, last_name)))
      `)
      .eq("org_id", orgId)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const items: ActivityItem[] = []

  function capitalise(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  // Payments
  for (const p of recentPayments ?? []) {
    const tenant = p.tenants as unknown as { contacts: { first_name: string; last_name: string } } | null
    const lease = p.leases as unknown as { units: { unit_number: string; properties: { name: string } } } | null
    const tenantName = tenant?.contacts
      ? `${tenant.contacts.first_name} ${tenant.contacts.last_name}`.trim()
      : "Tenant"
    const location = lease?.units ? `${lease.units.unit_number}, ${lease.units.properties.name}` : ""
    const amountRands = Math.round((p.amount_cents ?? 0) / 100).toLocaleString("en-ZA")
    items.push({
      id: p.id,
      type: "payment",
      title: `Payment received — ${tenantName}`,
      subtitle: `R ${amountRands}${location ? ` · ${location}` : ""}`,
      timestamp: new Date(p.payment_date),
      dotColor: "#1D9E75",
    })
  }

  // Lease lifecycle events
  for (const e of recentLeaseEvents ?? []) {
    const lease = e.leases as unknown as {
      units: { unit_number: string; properties: { name: string } }
      tenants: { contacts: { first_name: string; last_name: string } }
    } | null
    const tenantName = lease?.tenants?.contacts
      ? `${lease.tenants.contacts.first_name} ${lease.tenants.contacts.last_name}`.trim()
      : "Tenant"
    const location = lease?.units
      ? `${lease.units.unit_number}, ${lease.units.properties.name}`
      : ""
    const eventLabel = capitalise((e.event_type ?? "lease event").replace(/_/g, " "))
    items.push({
      id: e.id,
      type: "lease",
      title: `${eventLabel} — ${tenantName}`,
      subtitle: location || e.description || "",
      timestamp: new Date(e.created_at),
      dotColor: "#7F77DD",
    })
  }

  // Maintenance updates
  for (const m of recentMaintenance ?? []) {
    const unit = m.units as unknown as { unit_number: string; properties: { name: string } } | null
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : ""
    const statusLabel = capitalise((m.status ?? "updated").replace(/_/g, " "))
    items.push({
      id: m.id,
      type: "maintenance",
      title: m.title,
      subtitle: `${statusLabel}${location ? ` · ${location}` : ""}`,
      timestamp: new Date(m.updated_at),
      dotColor: "#EF9F27",
      href: `/maintenance/${m.id}`,
    })
  }

  // Arrears actions
  for (const a of recentArrearsActions ?? []) {
    const arrearsCase = a.arrears_cases as unknown as {
      tenants: { contacts: { first_name: string; last_name: string } }
    } | null
    const tenantName = arrearsCase?.tenants?.contacts
      ? `${arrearsCase.tenants.contacts.first_name} ${arrearsCase.tenants.contacts.last_name}`.trim()
      : "Tenant"
    const actionLabel = capitalise((a.action_type ?? "action").replace(/_/g, " "))
    items.push({
      id: a.id,
      type: "arrears",
      title: `${actionLabel} sent — ${tenantName}`,
      subtitle: a.subject || a.channel || "",
      timestamp: new Date(a.sent_at),
      dotColor: "#E24B4A",
    })
  }

  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  return items.slice(0, 8)
}
