/**
 * lib/calendar/events.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { type SupabaseClient } from "@supabase/supabase-js"
import { subtractBusinessDays } from "@/lib/dates/saPublicHolidays"

export type EventType =
  | "inspection"
  | "inspection_overdue"
  | "maintenance"
  | "lease_expiry"
  | "cpa_deadline"
  | "deposit_deadline"
  | "move_in"
  | "move_out"

export interface CalendarEvent {
  id: string
  title: string
  date: string        // ISO date YYYY-MM-DD
  time?: string       // HH:MM
  endTime?: string    // HH:MM
  eventType: EventType
  colour: string      // Tailwind colour name used in FullCalendar
  propertyName: string
  unitNumber?: string
  link: string        // Navigation target
  priority: number    // Lower = higher priority (for same-day ordering)
  allDay: boolean
  sourceId: string    // Original record id
}

// FullCalendar event colours (mapped to CSS vars in the theme)
export const EVENT_COLOURS: Record<EventType, string> = {
  inspection: "#3b82f6",         // blue
  inspection_overdue: "#ef4444", // red
  maintenance: "#f59e0b",        // amber
  lease_expiry: "#8b5cf6",       // purple
  cpa_deadline: "#ef4444",       // red
  deposit_deadline: "#f59e0b",   // amber
  move_in: "#22c55e",            // green
  move_out: "#f97316",           // coral/orange
}

const EVENT_PRIORITY: Record<EventType, number> = {
  cpa_deadline: 1,
  deposit_deadline: 2,
  inspection_overdue: 3,
  inspection: 4,
  maintenance: 5,
  lease_expiry: 6,
  move_in: 7,
  move_out: 7,
}

type UnitRef = { unit_number: string; properties: { name: string } } | null

function unitSuffix(leaseUnit: UnitRef): string {
  return leaseUnit ? ` — ${leaseUnit.unit_number}` : ""
}

function makeLeaseExpiryEvent(lease: { id: string; end_date: string }, leaseUnit: UnitRef): CalendarEvent {
  return {
    id: `lease-exp-${lease.id}`,
    title: `Lease expiry${unitSuffix(leaseUnit)}`,
    date: lease.end_date,
    eventType: "lease_expiry",
    colour: EVENT_COLOURS.lease_expiry,
    propertyName: leaseUnit?.properties.name ?? "",
    unitNumber: leaseUnit?.unit_number,
    link: `/leases/${lease.id}`,
    priority: EVENT_PRIORITY.lease_expiry,
    allDay: true,
    sourceId: lease.id,
  }
}

function makeCpaDeadlineEvent(leaseId: string, noticeDateStr: string, leaseUnit: UnitRef): CalendarEvent {
  return {
    id: `cpa-${leaseId}`,
    title: `CPA notice due${unitSuffix(leaseUnit)}`,
    date: noticeDateStr,
    eventType: "cpa_deadline",
    colour: EVENT_COLOURS.cpa_deadline,
    propertyName: leaseUnit?.properties.name ?? "",
    unitNumber: leaseUnit?.unit_number,
    link: `/leases/${leaseId}`,
    priority: EVENT_PRIORITY.cpa_deadline,
    allDay: true,
    sourceId: leaseId,
  }
}

function makeMoveInEvent(lease: { id: string; start_date: string }, leaseUnit: UnitRef): CalendarEvent {
  return {
    id: `move-in-${lease.id}`,
    title: `Move-in${unitSuffix(leaseUnit)}`,
    date: lease.start_date,
    eventType: "move_in",
    colour: EVENT_COLOURS.move_in,
    propertyName: leaseUnit?.properties.name ?? "",
    unitNumber: leaseUnit?.unit_number,
    link: `/leases/${lease.id}`,
    priority: EVENT_PRIORITY.move_in,
    allDay: true,
    sourceId: lease.id,
  }
}

async function buildLeaseEvents(
  service: SupabaseClient,
  lease: { id: string; start_date: string; end_date: string | null; cpa_applies: boolean; auto_renewal_notice_sent_at: string | null },
  rangeStart: string,
  rangeEnd: string,
  today: string
): Promise<CalendarEvent[]> {
  if (!lease.end_date) return []
  const leaseResult2 = await service
    .from("leases")
    .select("id, units(unit_number, properties(name)), tenants(contacts(first_name, last_name))")
    .eq("id", lease.id)
    .single()
  const leaseUnit = (leaseResult2.data?.units as unknown as UnitRef)
  const events: CalendarEvent[] = []

  if (lease.end_date >= rangeStart && lease.end_date <= rangeEnd) {
    events.push(makeLeaseExpiryEvent(lease as { id: string; end_date: string }, leaseUnit))
  }

  if (lease.cpa_applies && !lease.auto_renewal_notice_sent_at) {
    const noticeDeadline = subtractBusinessDays(new Date(lease.end_date), 20)
    const noticeDateStr = noticeDeadline.toISOString().split("T")[0]
    if (noticeDateStr >= rangeStart && noticeDateStr <= rangeEnd) {
      events.push(makeCpaDeadlineEvent(lease.id, noticeDateStr, leaseUnit))
    }
  }

  if (lease.start_date >= today && lease.start_date >= rangeStart && lease.start_date <= rangeEnd) {
    events.push(makeMoveInEvent(lease as { id: string; start_date: string }, leaseUnit))
  }

  return events
}

function buildInspectionEvents(
  inspections: { id: string; type: string | null; scheduled_date: string; units: unknown }[],
  today: string
): CalendarEvent[] {
  return inspections.map((insp) => {
    const unit = insp.units as UnitRef
    // scheduled_date is a timestamptz (date + time in one column). Slice the wall-clock parts off the
    // ISO string — no Date parsing, so the time shows exactly as it was entered (no tz drift). A 00:00
    // time is treated as "no specific time" (legacy date-only entries), so it renders all-day.
    const datePart = insp.scheduled_date.slice(0, 10)
    const timePart = insp.scheduled_date.length > 10 ? insp.scheduled_date.slice(11, 16) : ""
    const hasTime = timePart !== "" && timePart !== "00:00"
    const eventType: EventType = datePart < today ? "inspection_overdue" : "inspection"
    const label = insp.type?.replaceAll("_", " ") ?? "Inspection"
    const unitNum = unit?.unit_number ?? ""
    return {
      id: `insp-${insp.id}`,
      title: unit ? `${label} — ${unitNum}` : label,
      date: datePart,
      time: hasTime ? timePart : undefined,
      eventType,
      colour: EVENT_COLOURS[eventType],
      propertyName: unit?.properties.name ?? "",
      unitNumber: unit?.unit_number,
      link: `/inspections/${insp.id}`,
      priority: EVENT_PRIORITY[eventType],
      allDay: !hasTime,
      sourceId: insp.id,
    }
  })
}

function buildMaintenanceEvents(
  requests: { id: string; title: string; scheduled_date: string; scheduled_time_from: string | null; scheduled_time_to: string | null; units: unknown }[]
): CalendarEvent[] {
  return requests.map((req) => {
    const unit = req.units as UnitRef
    return {
      id: `maint-${req.id}`,
      title: req.title,
      date: req.scheduled_date,
      time: req.scheduled_time_from ?? undefined,
      endTime: req.scheduled_time_to ?? undefined,
      eventType: "maintenance" satisfies EventType,
      colour: EVENT_COLOURS.maintenance,
      propertyName: unit?.properties.name ?? "",
      unitNumber: unit?.unit_number,
      link: `/maintenance/${req.id}`,
      priority: EVENT_PRIORITY.maintenance,
      allDay: !req.scheduled_time_from,
      sourceId: req.id,
    }
  })
}

function buildDepositEvents(
  timers: { id: string; deadline: string; leases: unknown }[]
): CalendarEvent[] {
  return timers.map((timer) => {
    const unit = (timer.leases as { units: UnitRef } | null)?.units ?? null
    const unitNum = unit?.unit_number ?? ""
    return {
      id: `deposit-${timer.id}`,
      title: unit ? `Deposit return deadline — ${unitNum}` : "Deposit return deadline",
      date: timer.deadline,
      eventType: "deposit_deadline" satisfies EventType,
      colour: EVENT_COLOURS.deposit_deadline,
      propertyName: unit?.properties.name ?? "",
      unitNumber: unit?.unit_number,
      link: `/finance/deposits`,
      priority: EVENT_PRIORITY.deposit_deadline,
      allDay: true,
      sourceId: timer.id,
    }
  })
}

export async function fetchCalendarEvents(
  service: SupabaseClient,
  orgId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<CalendarEvent[]> {
  const today = new Date().toISOString().split("T")[0]

  // Lease window: 90 days out for approaching expiry
  const rangeEnd90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  const [
    inspectionsResult,
    maintenanceResult,
    leasesResult,
    depositResult,
  ] = await Promise.all([
    service
      .from("inspections")
      .select("id, type:inspection_type, scheduled_date, status, units(unit_number, properties(name))")
      .eq("org_id", orgId)
      .in("status", ["scheduled"])
      .gte("scheduled_date", rangeStart)
      .lte("scheduled_date", rangeEnd),

    service
      .from("maintenance_requests")
      .select("id, title, category, urgency, scheduled_date, scheduled_time_from, scheduled_time_to, status, units(unit_number, properties(name))")
      .eq("org_id", orgId)
      .not("scheduled_date", "is", null)
      .gte("scheduled_date", rangeStart)
      .lte("scheduled_date", rangeEnd)
      .not("status", "in", "(cancelled,closed)"),

    service
      .from("leases")
      .select("id, start_date, end_date, status, cpa_applies, auto_renewal_notice_sent_at")
      .eq("org_id", orgId)
      .in("status", ["active", "notice"])
      .gte("end_date", today)
      .lte("end_date", rangeEnd90),

    service
      .from("deposit_timers")
      .select("id, deadline, status, timer_reason, lease_id, leases(units(unit_number, properties(name)))")
      .eq("org_id", orgId)
      .in("status", ["running", "overdue"])
      .gte("deadline", rangeStart)
      .lte("deadline", rangeEnd),
  ])

  const events: CalendarEvent[] = [
    ...buildInspectionEvents(inspectionsResult.data ?? [], today),
    ...buildMaintenanceEvents(maintenanceResult.data ?? []),
    ...buildDepositEvents(depositResult.data ?? []),
  ]

  // Leases: expiry + CPA deadlines + move events
  for (const lease of leasesResult.data ?? []) {
    const leaseEvents = await buildLeaseEvents(service, lease, rangeStart, rangeEnd, today)
    events.push(...leaseEvents)
  }

  // Sort by date then priority
  events.sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date)
    if (dateDiff !== 0) return dateDiff
    return a.priority - b.priority
  })

  return events
}

export async function fetchOverdueAlerts(
  service: SupabaseClient,
  orgId: string
): Promise<CalendarEvent[]> {
  const today = new Date().toISOString().split("T")[0]

  const [overdueInspections, overdueDeposits, cpaMissed] = await Promise.all([
    service
      .from("inspections")
      .select("id, type:inspection_type, scheduled_date, units(unit_number, properties(name))")
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .lt("scheduled_date", today),

    service
      .from("deposit_timers")
      .select("id, deadline, lease_id, leases(units(unit_number, properties(name)))")
      .eq("org_id", orgId)
      .in("status", ["running", "overdue"])
      .lt("deadline", today),

    service
      .from("leases")
      .select("id, end_date, cpa_applies, auto_renewal_notice_sent_at")
      .eq("org_id", orgId)
      .in("status", ["active", "notice"])
      .eq("cpa_applies", true)
      .is("auto_renewal_notice_sent_at", null)
      .gte("end_date", today),
  ])

  const alerts: CalendarEvent[] = []

  for (const insp of overdueInspections.data ?? []) {
    const unit = insp.units as unknown as UnitRef
    const unitNum = unit?.unit_number ?? ""
    alerts.push({
      id: `insp-overdue-${insp.id}`,
      title: unit ? `Overdue inspection — ${unitNum}` : "Overdue inspection",
      date: insp.scheduled_date.slice(0, 10),
      eventType: "inspection_overdue",
      colour: EVENT_COLOURS.inspection_overdue,
      propertyName: unit?.properties.name ?? "",
      unitNumber: unit?.unit_number,
      link: `/inspections/${insp.id}`,
      priority: EVENT_PRIORITY.inspection_overdue,
      allDay: true,
      sourceId: insp.id,
    })
  }

  for (const timer of overdueDeposits.data ?? []) {
    const leaseData = timer.leases as unknown as { units: UnitRef } | null
    const unit = leaseData?.units ?? null
    const unitNum = unit?.unit_number ?? ""
    alerts.push({
      id: `deposit-overdue-${timer.id}`,
      title: unit ? `Deposit return overdue — ${unitNum}` : "Deposit return overdue",
      date: timer.deadline,
      eventType: "deposit_deadline",
      colour: EVENT_COLOURS.deposit_deadline,
      propertyName: unit?.properties.name ?? "",
      unitNumber: unit?.unit_number,
      link: `/finance/deposits`,
      priority: EVENT_PRIORITY.deposit_deadline,
      allDay: true,
      sourceId: timer.id,
    })
  }

  for (const lease of cpaMissed.data ?? []) {
    if (!lease.end_date) continue
    const noticeDeadline = subtractBusinessDays(new Date(lease.end_date), 20)
    if (noticeDeadline <= new Date()) {
      const leaseData2 = await service
        .from("leases")
        .select("units(unit_number, properties(name))")
        .eq("id", lease.id)
        .single()
      const unit = (leaseData2.data?.units as unknown as UnitRef)
      const unitNum = unit?.unit_number ?? ""
      alerts.push({
        id: `cpa-missed-${lease.id}`,
        title: unit ? `CPA notice MISSED — ${unitNum}` : "CPA notice MISSED",
        date: noticeDeadline.toISOString().split("T")[0],
        eventType: "cpa_deadline",
        colour: EVENT_COLOURS.cpa_deadline,
        propertyName: unit?.properties.name ?? "",
        unitNumber: unit?.unit_number,
        link: `/leases/${lease.id}`,
        priority: EVENT_PRIORITY.cpa_deadline,
        allDay: true,
        sourceId: lease.id,
      })
    }
  }

  return alerts
}

// ── Calendar search entities (property / tenant / landlord) ────────────────────
export interface CalendarSearchEntity {
  type: "property" | "tenant" | "landlord"
  id: string
  name: string
  propertyNames: string[]   // events match by propertyName, so each entity resolves to its properties
}

type ContactName = { first_name: string | null; last_name: string | null; company_name: string | null } | null
function first<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null
  return x ?? null
}
function personName(c: ContactName): string {
  if (!c) return ""
  return (c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`).trim()
}

/** Searchable entities for the calendar combobox — each resolves to the property name(s) used to filter
 *  events: a property → itself; a landlord → all its properties; a tenant → their lease's property/ies. */
export async function fetchCalendarSearchEntities(supabase: SupabaseClient, orgId: string): Promise<CalendarSearchEntity[]> {
  const [propsRes, landlordsRes, leasesRes] = await Promise.all([
    supabase.from("properties").select("id, name, landlord_id").eq("org_id", orgId).is("deleted_at", null),
    supabase.from("landlords").select("id, contacts(first_name, last_name, company_name)").eq("org_id", orgId).is("deleted_at", null),
    supabase.from("leases").select("tenant_id, tenants(id, contacts(first_name, last_name, company_name)), units(properties(name))").eq("org_id", orgId),
  ])
  if (propsRes.error) console.error("fetchCalendarSearchEntities properties:", propsRes.error.message)
  if (landlordsRes.error) console.error("fetchCalendarSearchEntities landlords:", landlordsRes.error.message)
  if (leasesRes.error) console.error("fetchCalendarSearchEntities leases:", leasesRes.error.message)

  const props = propsRes.data ?? []
  const entities: CalendarSearchEntity[] = []

  // Properties
  for (const p of props) entities.push({ type: "property", id: p.id, name: p.name, propertyNames: [p.name] })

  // Landlords → their properties (properties.landlord_id)
  const propsByLandlord = new Map<string, string[]>()
  for (const p of props) {
    const lid = (p as { landlord_id?: string | null }).landlord_id
    if (!lid) continue
    const arr = propsByLandlord.get(lid) ?? []
    arr.push(p.name)
    propsByLandlord.set(lid, arr)
  }
  for (const l of landlordsRes.data ?? []) {
    const name = personName(first(l.contacts) as ContactName)
    if (name) entities.push({ type: "landlord", id: l.id, name, propertyNames: propsByLandlord.get(l.id) ?? [] })
  }

  // Tenants → their lease's property/ies
  const tenantMap = new Map<string, { name: string; props: Set<string> }>()
  for (const lease of leasesRes.data ?? []) {
    const t = first(lease.tenants) as { id: string; contacts: ContactName } | null
    if (!t) continue
    const name = personName(first(t.contacts) as ContactName)
    const unit = first(lease.units) as { properties?: { name: string } | { name: string }[] } | null
    const propName = (first(unit?.properties) as { name: string } | null)?.name
    const entry = tenantMap.get(t.id) ?? { name, props: new Set<string>() }
    if (propName) entry.props.add(propName)
    tenantMap.set(t.id, entry)
  }
  for (const [id, { name, props: pset }] of tenantMap) {
    if (name) entities.push({ type: "tenant", id, name, propertyNames: [...pset] })
  }

  return entities
}
