import { getCachedServiceClient } from "@/lib/supabase/server"

export interface AttentionItem {
  id: string
  type: "arrears" | "maintenance" | "compliance" | "inspection" | "application" | "deposit"
  priority: number // 1=urgent/red, 2=needs action/amber, 3=informational/blue
  title: string
  subtitle: string
  href: string
  badge: { text: string; variant: "red" | "amber" | "blue" | "green" }
  dotColor: string
  sortDate: Date
}

export async function getAttentionItems(orgId: string): Promise<AttentionItem[]> {
  const supabase = await getCachedServiceClient()
  const now = new Date()
  const sixtyDaysOut = new Date(now)
  sixtyDaysOut.setDate(now.getDate() + 60)
  const sevenDaysOut = new Date(now)
  sevenDaysOut.setDate(now.getDate() + 7)

  const [
    { data: arrearsCases },
    { data: maintenanceNeedingAction },
    { data: cpaNoticesDue },
    { data: upcomingInspections },
    { data: pendingApplications },
    { data: depositTimers },
  ] = await Promise.all([
    supabase
      .from("arrears_cases")
      .select(`
        id, total_arrears_cents, months_in_arrears, oldest_outstanding_date, status,
        tenants(id, contacts(first_name, last_name, company_name)),
        units(unit_number, properties(name))
      `)
      .eq("org_id", orgId)
      .in("status", ["open", "payment_arrangement", "legal"])
      .order("oldest_outstanding_date", { ascending: true })
      .limit(5),
    supabase
      .from("maintenance_requests")
      .select(`
        id, title, category, status, created_at,
        units(unit_number, properties(name))
      `)
      .eq("org_id", orgId)
      .in("status", ["pending_review", "approved", "pending_landlord"])
      .order("created_at", { ascending: true })
      .limit(3),
    supabase
      .from("leases")
      .select(`
        id, end_date, auto_renewal_notice_sent_at,
        units(unit_number, properties(name)),
        tenants(contacts(first_name, last_name))
      `)
      .eq("org_id", orgId)
      .in("status", ["active"])
      .eq("is_fixed_term", true)
      .eq("cpa_applies", true)
      .is("auto_renewal_notice_sent_at", null)
      .lte("end_date", sixtyDaysOut.toISOString())
      .is("deleted_at", null),
    supabase
      .from("inspections")
      .select(`
        id, inspection_type, scheduled_date,
        units(unit_number, properties(name)),
        tenants(contacts(first_name, last_name))
      `)
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .lte("scheduled_date", sevenDaysOut.toISOString())
      .gte("scheduled_date", now.toISOString())
      .order("scheduled_date", { ascending: true })
      .limit(3),
    supabase
      .from("applications")
      .select(`
        id, first_name, last_name, stage1_status, stage2_status,
        units(unit_number, properties(name))
      `)
      .eq("org_id", orgId)
      .or("stage1_status.eq.pre_screen_complete,stage2_status.eq.screening_complete")
      .limit(3),
    supabase
      .from("deposit_timers")
      .select(`
        id, deadline, status,
        leases(units(unit_number, properties(name)), tenants(contacts(first_name, last_name)))
      `)
      .eq("org_id", orgId)
      .eq("status", "running")
      .order("deadline", { ascending: true })
      .limit(3),
  ])

  const items: AttentionItem[] = []

  // Arrears cases
  for (const c of arrearsCases ?? []) {
    const oldest = c.oldest_outstanding_date ? new Date(c.oldest_outstanding_date) : now
    const daysOverdue = Math.floor((now.getTime() - oldest.getTime()) / 86400000)
    const unit = c.units as unknown as { unit_number: string; properties: { name: string } } | null
    const tenant = c.tenants as unknown as { contacts: { first_name: string; last_name: string; company_name: string | null } } | null
    const tenantName =
      tenant?.contacts?.company_name
      ?? (`${tenant?.contacts?.first_name ?? ""} ${tenant?.contacts?.last_name ?? ""}`.trim() || "Unknown")
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const months = c.months_in_arrears ?? 1
    const isHighSeverity = daysOverdue > 30
    items.push({
      id: c.id,
      type: "arrears",
      priority: isHighSeverity ? 1 : 2,
      title: `Arrears — ${tenantName}`,
      subtitle: `${location} · ${months} month${months !== 1 ? "s" : ""} overdue`,
      href: `/payments/arrears/${c.id}`,
      badge: { text: `${daysOverdue}d overdue`, variant: isHighSeverity ? "red" : "amber" },
      dotColor: isHighSeverity ? "#E24B4A" : "#EF9F27",
      sortDate: oldest,
    })
  }

  // Maintenance needing action
  for (const m of maintenanceNeedingAction ?? []) {
    const unit = m.units as unknown as { unit_number: string; properties: { name: string } } | null
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const statusLabel =
      m.status === "pending_review" ? "Pending review"
      : m.status === "approved" ? "Approved"
      : "Pending landlord"
    items.push({
      id: m.id,
      type: "maintenance",
      priority: 2,
      title: m.title,
      subtitle: location,
      href: `/maintenance/${m.id}`,
      badge: { text: statusLabel, variant: "amber" },
      dotColor: "#EF9F27",
      sortDate: new Date(m.created_at),
    })
  }

  // CPA s14 notices due
  for (const l of cpaNoticesDue ?? []) {
    const unit = l.units as unknown as { unit_number: string; properties: { name: string } } | null
    const tenant = l.tenants as unknown as { contacts: { first_name: string; last_name: string } } | null
    const tenantName = tenant?.contacts
      ? `${tenant.contacts.first_name} ${tenant.contacts.last_name}`.trim()
      : "Unknown"
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const endDate = new Date(l.end_date)
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86400000)
    items.push({
      id: l.id,
      type: "compliance",
      priority: 2,
      title: `CPA s14 notice due — ${tenantName}`,
      subtitle: `${location} · ends ${endDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`,
      href: `/leases/${l.id}`,
      badge: { text: `${daysLeft}d left`, variant: "amber" },
      dotColor: "#EF9F27",
      sortDate: endDate,
    })
  }

  // Upcoming inspections
  for (const i of upcomingInspections ?? []) {
    const unit = i.units as unknown as { unit_number: string; properties: { name: string } } | null
    const tenant = i.tenants as unknown as { contacts: { first_name: string; last_name: string } } | null
    const tenantName = tenant?.contacts
      ? `${tenant.contacts.first_name} ${tenant.contacts.last_name}`.trim()
      : "Unknown"
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const scheduledDate = new Date(i.scheduled_date)
    const typeLabel =
      i.inspection_type === "move_in" ? "Move-in"
      : i.inspection_type === "move_out" ? "Move-out"
      : "Inspection"
    items.push({
      id: i.id,
      type: "inspection",
      priority: 3,
      title: `${typeLabel} — ${tenantName}`,
      subtitle: `${location} · ${scheduledDate.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`,
      href: `/inspections/${i.id}`,
      badge: {
        text: scheduledDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
        variant: "blue",
      },
      dotColor: "#378ADD",
      sortDate: scheduledDate,
    })
  }

  // Pending applications
  for (const a of pendingApplications ?? []) {
    const unit = a.units as unknown as { unit_number: string; properties: { name: string } } | null
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const stage = a.stage2_status === "screening_complete" ? "Stage 2 ready" : "Stage 1 ready"
    items.push({
      id: a.id,
      type: "application",
      priority: 3,
      title: `Application — ${a.first_name} ${a.last_name}`,
      subtitle: location,
      href: `/applications/${a.id}`,
      badge: { text: stage, variant: "blue" },
      dotColor: "#378ADD",
      sortDate: now,
    })
  }

  // Deposit timers
  for (const d of depositTimers ?? []) {
    const lease = d.leases as unknown as {
      units: { unit_number: string; properties: { name: string } }
      tenants: { contacts: { first_name: string; last_name: string } }
    } | null
    const unit = lease?.units
    const tenant = lease?.tenants
    const tenantName = tenant?.contacts
      ? `${tenant.contacts.first_name} ${tenant.contacts.last_name}`.trim()
      : "Unknown"
    const location = unit ? `${unit.unit_number}, ${unit.properties.name}` : "Unknown"
    const deadline = new Date(d.deadline)
    const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
    const isOverdue = daysUntil < 0
    const isUrgent = !isOverdue && daysUntil < 7
    items.push({
      id: d.id,
      type: "deposit",
      priority: isOverdue ? 1 : isUrgent ? 2 : 3,
      title: `Deposit timer — ${tenantName}`,
      subtitle: location,
      href: `/finance/deposits`,
      badge: {
        text: isOverdue ? "Overdue" : `${daysUntil}d left`,
        variant: isOverdue ? "red" : isUrgent ? "amber" : "blue",
      },
      dotColor: isOverdue ? "#E24B4A" : isUrgent ? "#EF9F27" : "#378ADD",
      sortDate: deadline,
    })
  }

  // Sort priority asc, then sortDate asc (most urgent first within each priority)
  items.sort((a, b) => a.priority - b.priority || a.sortDate.getTime() - b.sortDate.getTime())

  return items.slice(0, 8)
}
