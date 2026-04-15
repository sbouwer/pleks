import Link from "next/link"
import { Calendar, Wrench, Building2 } from "lucide-react"

const AUDIT_DOT: Record<string, string> = {
  lease_created: "#7F77DD", lease_signed: "#7F77DD", lease_renewed: "#7F77DD",
  deposit_received: "#1D9E75", escalation_processed: "#1D9E75",
  inspection_scheduled: "#378ADD", inspection_completed: "#1D9E75",
  notice_given: "#EF9F27", s14_notice_sent: "#EF9F27",
  lease_expired: "#E24B4A", lease_cancelled: "#E24B4A",
  arrears_case_opened: "#E24B4A",
}

type StatusPill = { label: string; color: "green" | "amber" | "red" | "blue" | "grey" }

function statusPill(status: string): StatusPill {
  const s = status.toLowerCase()
  if (["completed", "passed", "closed", "resolved", "tenant_notified", "agent_signoff"].some(v => s.includes(v))) return { label: status, color: "green" }
  if (["scheduled", "pending", "in_progress", "open", "approved", "work_order_sent", "acknowledged"].some(v => s.includes(v))) return { label: status, color: "amber" }
  if (["overdue", "failed", "cancelled", "rejected"].some(v => s.includes(v))) return { label: status, color: "red" }
  return { label: status, color: "grey" }
}

const PILL_CLASSES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  grey: "bg-muted text-muted-foreground",
}

interface Inspection {
  id: string
  inspection_type: string
  status: string
  scheduled_date: string | null
  completed_at: string | null
}

interface MaintenanceRequest {
  id: string
  title: string
  work_order_number: string | null
  urgency: string | null
  status: string
  created_at: string
}

interface LifecycleEvent {
  id: string
  event_type: string
  description: string | null
  created_at: string
}

interface ComplianceItem {
  dot: string
  label: string
  value: string | null
  overdue?: boolean
}

interface OperationsTabProps {
  readonly leaseId: string
  readonly unitId: string | null
  readonly unitNumber: string | null
  readonly inspections: Inspection[]
  readonly maintenanceRequests: MaintenanceRequest[]
  readonly lifecycleEvents: LifecycleEvent[]
  readonly complianceItems: ComplianceItem[]
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
}

function urgencyLabel(urgency: string | null): string {
  if (!urgency) return ""
  const map: Record<string, string> = { emergency: "Emergency", urgent: "Urgent", routine: "Normal", cosmetic: "Cosmetic" }
  return map[urgency] ?? urgency
}

function eventLabel(eventType: string, description: string | null): string {
  const base = eventType.replaceAll("_", " ").replace(/^\w/, c => c.toUpperCase())
  if (!description) return base
  // Append description after em-dash for richer display
  const short = description.length > 40 ? `${description.slice(0, 40)}…` : description
  return `${base} — ${short}`
}

export function OperationsTab({
  leaseId: _leaseId,
  unitId,
  unitNumber,
  inspections,
  maintenanceRequests,
  lifecycleEvents,
  complianceItems,
}: OperationsTabProps) {
  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={unitId ? `/inspections?unit=${unitId}&action=new` : `/inspections?action=new`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Calendar className="h-3.5 w-3.5" />
          Schedule inspection
        </Link>
        <Link
          href={unitId ? `/maintenance?unit=${unitId}&action=new` : `/maintenance?action=new`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Wrench className="h-3.5 w-3.5" />
          Log maintenance
        </Link>
        {unitId && (
          <Link
            href={`/properties/${unitId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Building2 className="h-3.5 w-3.5" />
            View unit
          </Link>
        )}
      </div>

      {/* Top row: Inspections + Maintenance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inspections */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="px-4 py-3 border-b shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Inspections</p>
          </div>
          <div className="p-4 flex-1">
            {inspections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inspections recorded.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {inspections.slice(0, 3).map((ins) => {
                  const pill = statusPill(ins.status)
                  const date = ins.completed_at ?? ins.scheduled_date
                  return (
                    <div key={ins.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold capitalize">{ins.inspection_type.replaceAll("_", " ")}</p>
                        {unitNumber && (
                          <p className="text-xs text-muted-foreground">{unitNumber}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PILL_CLASSES[pill.color]}`}>
                          {pill.label.replaceAll("_", " ")}
                        </span>
                        {date && <p className="text-xs text-muted-foreground mt-0.5">{fmt(date)}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t shrink-0">
            <Link
              href={unitId ? `/inspections?unit=${unitId}` : `/inspections`}
              className="text-xs text-brand hover:underline"
            >
              View all inspections →
            </Link>
          </div>
        </div>

        {/* Maintenance */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="px-4 py-3 border-b shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Maintenance</p>
          </div>
          <div className="p-4 flex-1">
            {maintenanceRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No maintenance requests recorded.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {maintenanceRequests.slice(0, 3).map((m) => {
                  const pill = statusPill(m.status)
                  const sub = [m.work_order_number ? `WO-${m.work_order_number}` : null, urgencyLabel(m.urgency) || null].filter(Boolean).join(" · ")
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{m.title}</p>
                        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PILL_CLASSES[pill.color]}`}>
                          {pill.label.replaceAll("_", " ")}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">{fmt(m.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t shrink-0">
            <Link
              href={unitId ? `/maintenance?unit=${unitId}` : `/maintenance`}
              className="text-xs text-brand hover:underline"
            >
              View all maintenance →
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom row: Compliance calendar + Audit trail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Compliance calendar */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="px-4 py-3 border-b shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Compliance calendar</p>
          </div>
          <div className="p-4 flex-1">
            {complianceItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compliance items.</p>
            ) : (
              <div className="space-y-3">
                {complianceItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.dot }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{item.label}</p>
                      {item.value && (
                        <p className={`text-xs ${item.overdue ? "text-danger" : "text-muted-foreground"}`}>
                          {item.value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t shrink-0">
            <span className="text-xs text-muted-foreground">View full compliance timeline →</span>
          </div>
        </div>

        {/* Audit trail */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="px-4 py-3 border-b shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Audit trail</p>
          </div>
          <div className="p-4 flex-1">
            {lifecycleEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded.</p>
            ) : (
              <div className="space-y-3">
                {lifecycleEvents.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: AUDIT_DOT[e.event_type] ?? "#6b7280" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{eventLabel(e.event_type, e.description)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t shrink-0">
            <span className="text-xs text-muted-foreground">View full audit trail →</span>
          </div>
        </div>
      </div>
    </div>
  )
}
