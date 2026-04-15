import Link from "next/link"

const AUDIT_DOT: Record<string, string> = {
  lease_created: "#378ADD", lease_signed: "#7F77DD", lease_renewed: "#7F77DD",
  deposit_received: "#1D9E75", escalation_processed: "#1D9E75",
  inspection_scheduled: "#EF9F27", inspection_completed: "#1D9E75",
  notice_given: "#EF9F27", s14_notice_sent: "#EF9F27",
  lease_expired: "#E24B4A", lease_cancelled: "#E24B4A",
}

type StatusPill = { label: string; color: "green" | "amber" | "red" | "blue" | "grey" }

function statusPill(status: string): StatusPill {
  const s = status.toLowerCase()
  if (["completed", "passed", "closed", "resolved"].some(v => s.includes(v))) return { label: status, color: "green" }
  if (["scheduled", "pending", "in_progress", "open"].some(v => s.includes(v))) return { label: status, color: "amber" }
  if (["overdue", "failed", "cancelled"].some(v => s.includes(v))) return { label: status, color: "red" }
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
  leaseId: string
  unitId: string | null
  inspections: Inspection[]
  maintenanceRequests: MaintenanceRequest[]
  lifecycleEvents: LifecycleEvent[]
  complianceItems: ComplianceItem[]
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

export function OperationsTab({
  leaseId: _leaseId,
  unitId,
  inspections,
  maintenanceRequests,
  lifecycleEvents,
  complianceItems,
}: OperationsTabProps) {
  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={unitId ? `/inspections?unit=${unitId}` : `/inspections`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          View inspections
        </Link>
        <Link
          href={unitId ? `/maintenance?unit=${unitId}` : `/maintenance`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          View maintenance
        </Link>
        {unitId && (
          <Link
            href={`/properties/${unitId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            View unit
          </Link>
        )}
      </div>

      {/* Top row: Inspections + Maintenance (equal height) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inspections */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <h3 className="text-sm font-semibold">Inspections</h3>
            <Link
              href={unitId ? `/inspections?unit=${unitId}` : `/inspections`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="p-4 flex-1">
            {inspections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inspections recorded.</p>
            ) : (
              <div className="space-y-3">
                {inspections.slice(0, 3).map((ins) => {
                  const pill = statusPill(ins.status)
                  const date = ins.completed_at ?? ins.scheduled_date
                  return (
                    <div key={ins.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium capitalize truncate">{ins.inspection_type.replaceAll("_", " ")}</p>
                        {date && <p className="text-xs text-muted-foreground">{fmt(date)}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PILL_CLASSES[pill.color]}`}>
                        {pill.label.replaceAll("_", " ")}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Maintenance */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <h3 className="text-sm font-semibold">Maintenance</h3>
            <Link
              href={unitId ? `/maintenance?unit=${unitId}` : `/maintenance`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="p-4 flex-1">
            {maintenanceRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No maintenance requests recorded.</p>
            ) : (
              <div className="space-y-3">
                {maintenanceRequests.slice(0, 3).map((m) => {
                  const pill = statusPill(m.status)
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.title}</p>
                        {m.work_order_number && (
                          <p className="text-xs text-muted-foreground">WO #{m.work_order_number}</p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PILL_CLASSES[pill.color]}`}>
                        {pill.label.replaceAll("_", " ")}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Compliance calendar + Audit trail (equal height) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Compliance calendar */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Compliance calendar</h3>
          {complianceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compliance items.</p>
          ) : (
            <div className="space-y-3">
              {complianceItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.dot }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
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

        {/* Audit trail */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Audit trail</h3>
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
                    <p className="text-sm font-medium capitalize">{e.event_type.replaceAll("_", " ")}</p>
                    {e.description && (
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
