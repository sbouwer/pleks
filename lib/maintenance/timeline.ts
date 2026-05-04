/**
 * lib/maintenance/timeline.ts — unified timeline builder for maintenance request detail pages
 *
 * Data:   audit_log, contractor_updates, maintenance_delay_events, maintenance_photos,
 *         maintenance_quotes, communication_log, maintenance_cost_allocations
 * Notes:  Returns all event types merged and sorted descending by occurred_at.
 *         Sourced from multiple tables; caller passes pre-fetched arrays to avoid
 *         extra round-trips (page.tsx already fetches most of these).
 */

export type TimelineEventType =
  | "creation"
  | "status_change"
  | "field_update"
  | "note"
  | "delay"
  | "photo"
  | "quote"
  | "comm"
  | "cost_allocation"
  | "contractor_update"
  | "cancellation"
  | "reassignment"

export interface TimelineActor {
  type: "agent" | "tenant" | "contractor" | "system"
  name?: string
}

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  occurred_at: string
  actor: TimelineActor
  summary: string
  details?: Record<string, unknown>
  source: { table: string; id: string }
}

// ── Input row shapes (minimal — only fields the builder needs) ────────────────

interface AuditRow {
  id: string
  action: string
  new_values: Record<string, unknown> | null
  old_values?: Record<string, unknown> | null
  created_at: string
  changed_by?: string | null
  actor_name?: string | null
}

interface ContractorUpdateRow {
  id: string
  new_status: string
  notes: string | null
  created_at: string
  actor_name?: string | null
}

interface DelayRow {
  id: string
  delay_type: string
  attributed_to: string
  occurred_at: string
  note: string | null
  original_date?: string | null
  rescheduled_to?: string | null
}

interface PhotoRow {
  id: string
  photo_phase: string
  uploaded_by?: string | null
  visible_to_tenant: boolean
  created_at: string
  uploader_name?: string | null
}

interface QuoteRow {
  id: string
  amount_cents: number
  status: string
  created_at: string
  contractor_name?: string | null
}

interface CommRow {
  id: string
  template_key: string
  channel: string
  status: string
  created_at: string
  recipient_name?: string | null
}

interface CostAllocationRow {
  id: string
  allocation_type: string
  amount_cents: number
  description: string
  created_at: string
}

export interface TimelineInput {
  requestId: string
  createdAt: string
  loggedBy: string
  loggedByName?: string
  auditRows: AuditRow[]
  contractorUpdates: ContractorUpdateRow[]
  delayEvents: DelayRow[]
  photos: PhotoRow[]
  quotes: QuoteRow[]
  comms: CommRow[]
  costAllocations: CostAllocationRow[]
}

// ── Human-readable labels ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  work_order_sent: "Work order sent",
  acknowledged: "Acknowledged by contractor",
  in_progress: "In progress",
  pending_completion: "Pending sign-off",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
}

const DELAY_TYPE_LABELS: Record<string, string> = {
  tenant_not_available: "Tenant not available",
  tenant_rescheduled: "Tenant rescheduled",
  tenant_no_response: "Tenant no response",
  tenant_denied_access: "Tenant denied access",
  contractor_no_show: "Contractor no-show",
  contractor_rescheduled: "Contractor rescheduled",
  contractor_no_response: "Contractor no response",
  contractor_returned_incomplete: "Work returned incomplete",
  agent_pending_approval: "Pending approval",
  agent_pending_quote_review: "Pending quote review",
  agent_pending_landlord_approval: "Awaiting landlord approval",
  parts_on_order: "Parts on order",
  weather: "Weather delay",
  access_issue_other: "Access issue",
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replaceAll("_", " ")
}

function fieldLabel(key: string): string {
  const MAP: Record<string, string> = {
    title: "Title",
    description: "Description",
    category_override: "Category",
    urgency_override: "Urgency",
    access_instructions: "Access instructions",
    special_instructions: "Special instructions",
    contact_name: "Contact name",
    contact_phone: "Contact phone",
    estimated_cost_cents: "Estimated cost",
    scheduled_date: "Scheduled date",
    scheduled_time_from: "Scheduled from",
    scheduled_time_to: "Scheduled to",
    contractor_id: "Contractor",
  }
  return MAP[key] ?? key.replaceAll("_", " ")
}

function resolveActorType(who: string): TimelineActor["type"] {
  if (who === "tenant") return "tenant"
  if (who === "contractor") return "contractor"
  return "agent"
}

// ── Per-section event builders ────────────────────────────────────────────────

function buildNoteEvent(row: AuditRow, note: string): TimelineEvent {
  if (note.startsWith("Request cancelled:")) {
    return { id: `cancellation-${row.id}`, type: "cancellation", occurred_at: row.created_at, actor: { type: "agent", name: row.actor_name ?? undefined }, summary: note, source: { table: "audit_log", id: row.id } }
  }
  if (note.startsWith("Contractor changed:")) {
    return { id: `reassignment-${row.id}`, type: "reassignment", occurred_at: row.created_at, actor: { type: "agent", name: row.actor_name ?? undefined }, summary: note, source: { table: "audit_log", id: row.id } }
  }
  const newVals = row.new_values ?? {}
  return {
    id: `note-${row.id}`, type: "note", occurred_at: row.created_at,
    actor: { type: "agent", name: row.actor_name ?? undefined }, summary: note,
    details: newVals.notified_landlord ? { notified_landlord: true } : undefined,
    source: { table: "audit_log", id: row.id },
  }
}

function buildUpdateEvent(row: AuditRow): TimelineEvent | null {
  const newVals = row.new_values ?? {}
  const oldVals = row.old_values ?? {}
  if ("status" in newVals) {
    return {
      id: `status-${row.id}`, type: "status_change", occurred_at: row.created_at,
      actor: { type: "agent", name: row.actor_name ?? undefined },
      summary: `Status → ${statusLabel(newVals.status as string)}`,
      details: { from: oldVals.status, to: newVals.status },
      source: { table: "audit_log", id: row.id },
    }
  }
  const changedKeys = Object.keys(newVals)
  if (changedKeys.length === 0) return null
  return {
    id: `edit-${row.id}`, type: "field_update", occurred_at: row.created_at,
    actor: { type: "agent", name: row.actor_name ?? undefined },
    summary: `Edited: ${changedKeys.map(fieldLabel).join(", ")}`,
    details: { changes: changedKeys.map(k => ({ field: fieldLabel(k), from: oldVals[k], to: newVals[k] })) },
    source: { table: "audit_log", id: row.id },
  }
}

function buildAuditEvents(rows: AuditRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const row of rows) {
    if (row.action === "NOTE") {
      const note = row.new_values?.note as string | undefined
      if (note) events.push(buildNoteEvent(row, note))
      continue
    }
    if (row.action === "UPDATE") {
      const ev = buildUpdateEvent(row)
      if (ev) events.push(ev)
    }
  }
  return events
}

function buildContractorUpdateEvents(rows: ContractorUpdateRow[]): TimelineEvent[] {
  return rows.map(u => ({
    id: `contractor-update-${u.id}`, type: "contractor_update" as const, occurred_at: u.created_at,
    actor: { type: "contractor" as const, name: u.actor_name ?? undefined },
    summary: u.notes ? `${statusLabel(u.new_status)} — ${u.notes}` : statusLabel(u.new_status),
    details: u.notes ? { notes: u.notes } : undefined,
    source: { table: "contractor_updates", id: u.id },
  }))
}

function buildDelayEvents(rows: DelayRow[]): TimelineEvent[] {
  return rows.map(d => ({
    id: `delay-${d.id}`, type: "delay" as const, occurred_at: d.occurred_at,
    actor: { type: resolveActorType(d.attributed_to) },
    summary: `Delay: ${DELAY_TYPE_LABELS[d.delay_type] ?? d.delay_type.replaceAll("_", " ")}`,
    details: { delay_type: d.delay_type, attributed_to: d.attributed_to, note: d.note, original_date: d.original_date, rescheduled_to: d.rescheduled_to },
    source: { table: "maintenance_delay_events", id: d.id },
  }))
}

function buildPhotoEvents(rows: PhotoRow[]): TimelineEvent[] {
  return rows.map(p => {
    const hiddenSuffix = p.visible_to_tenant ? "" : " · hidden from tenant"
    return {
      id: `photo-${p.id}`, type: "photo" as const, occurred_at: p.created_at,
      actor: { type: resolveActorType(p.uploaded_by ?? "agent"), name: p.uploader_name ?? undefined },
      summary: `Photo uploaded (${p.photo_phase ?? "before"}${hiddenSuffix})`,
      details: { phase: p.photo_phase, visible_to_tenant: p.visible_to_tenant },
      source: { table: "maintenance_photos", id: p.id },
    }
  })
}

function buildQuoteEvents(rows: QuoteRow[]): TimelineEvent[] {
  return rows.map(q => ({
    id: `quote-${q.id}`, type: "quote" as const, occurred_at: q.created_at,
    actor: { type: "contractor" as const, name: q.contractor_name ?? undefined },
    summary: `Quote submitted: R ${(q.amount_cents / 100).toFixed(2)} (${q.status})`,
    details: { amount_cents: q.amount_cents, status: q.status },
    source: { table: "maintenance_quotes", id: q.id },
  }))
}

function buildCommEvents(rows: CommRow[]): TimelineEvent[] {
  return rows.map(c => {
    const key = c.template_key.replace(/^maintenance\./, "")
    return {
      id: `comm-${c.id}`, type: "comm" as const, occurred_at: c.created_at,
      actor: { type: "system" as const },
      summary: `${key} → ${c.recipient_name ?? "recipient"} via ${c.channel} (${c.status})`,
      details: { template_key: c.template_key, channel: c.channel, status: c.status },
      source: { table: "communication_log", id: c.id },
    }
  })
}

function buildCostAllocationEvents(rows: CostAllocationRow[]): TimelineEvent[] {
  return rows.map(a => {
    const allocationLabel = a.allocation_type === "landlord_expense" ? "Landlord expense" : "Tenant charge"
    return {
      id: `cost-${a.id}`, type: "cost_allocation" as const, occurred_at: a.created_at,
      actor: { type: "agent" as const },
      summary: `${allocationLabel}: R ${(a.amount_cents / 100).toFixed(2)} — ${a.description}`,
      details: { allocation_type: a.allocation_type, amount_cents: a.amount_cents, description: a.description },
      source: { table: "maintenance_cost_allocations", id: a.id },
    }
  })
}

// ── Public builder ────────────────────────────────────────────────────────────

export function buildUnifiedTimeline(input: TimelineInput): TimelineEvent[] {
  const creationActor: TimelineActor["type"] = input.loggedBy === "tenant" ? "tenant" : "agent"
  const events: TimelineEvent[] = [
    {
      id: `creation-${input.requestId}`, type: "creation", occurred_at: input.createdAt,
      actor: { type: creationActor, name: input.loggedByName },
      summary: "Request logged",
      source: { table: "maintenance_requests", id: input.requestId },
    },
    ...buildAuditEvents(input.auditRows),
    ...buildContractorUpdateEvents(input.contractorUpdates),
    ...buildDelayEvents(input.delayEvents),
    ...buildPhotoEvents(input.photos),
    ...buildQuoteEvents(input.quotes),
    ...buildCommEvents(input.comms),
    ...buildCostAllocationEvents(input.costAllocations),
  ]
  events.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
  return events
}
