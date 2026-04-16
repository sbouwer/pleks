import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecentInspection {
  id: string
  type: string | null
  status: string
  scheduled_date: string | null
  unit_number: string | null
}

export interface RecentMaintenance {
  id: string
  title: string
  work_order_number: string | null
  status: string
  created_at: string
  unit_number: string | null
}

export interface ComplianceItem {
  id: string
  colour: "green" | "amber" | "red" | "blue" | "grey"
  label: string
  date: string
  link?: string
}

export interface AuditItem {
  id: string
  action: string
  table_name: string
  created_at: string
  changed_by_name?: string | null
}

interface OperationsTabProps {
  propertyId: string
  inspections: RecentInspection[]
  maintenance: RecentMaintenance[]
  complianceItems: ComplianceItem[]
  auditItems: AuditItem[]
}

// ── Shared sub-components ─────────────────────────────────────────────────────

const DOT_COLOUR: Record<ComplianceItem["colour"], string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red:   "bg-red-500",
  blue:  "bg-blue-500",
  grey:  "bg-muted-foreground/40",
}

const INSPECTION_STATUS_PILL: Record<string, string> = {
  scheduled:   "bg-blue-500/10 text-blue-600",
  in_progress: "bg-amber-500/10 text-amber-600",
  completed:   "bg-emerald-500/10 text-emerald-600",
  cancelled:   "bg-muted text-muted-foreground",
}

const MAINTENANCE_STATUS_PILL: Record<string, string> = {
  pending_review:      "bg-amber-500/10 text-amber-600",
  approved:            "bg-blue-500/10 text-blue-600",
  in_progress:         "bg-blue-500/10 text-blue-600",
  completed:           "bg-emerald-500/10 text-emerald-600",
  cancelled:           "bg-muted text-muted-foreground",
  closed:              "bg-muted text-muted-foreground",
}

function statusPill(map: Record<string, string>, status: string, label?: string) {
  const cls = map[status] ?? "bg-muted text-muted-foreground"
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", cls)}>
      {label ?? status.replaceAll("_", " ")}
    </span>
  )
}

function SectionCard({ title, viewAllHref, children }: Readonly<{
  title: string
  viewAllHref?: string
  children: React.ReactNode
}>) {
  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{title}</span>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs text-brand hover:underline">
            View all →
          </Link>
        )}
      </div>
      <CardContent className="pt-3 pb-3">{children}</CardContent>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function OperationsTab({
  propertyId,
  inspections,
  maintenance,
  complianceItems,
  auditItems,
}: Readonly<OperationsTabProps>) {
  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Button size="sm" render={<a href={`/inspections/new?propertyId=${propertyId}`} />}>
          Schedule inspection
        </Button>
        <Button size="sm" variant="outline" render={<a href={`/maintenance/new?propertyId=${propertyId}`} />}>
          Log maintenance
        </Button>
      </div>

      {/* Top row: Inspections + Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Inspections */}
        <SectionCard title="Inspections" viewAllHref={`/inspections?propertyId=${propertyId}`}>
          {inspections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No inspections scheduled.</p>
          ) : (
            <div className="space-y-2">
              {inspections.map((insp) => (
                <Link
                  key={insp.id}
                  href={`/inspections/${insp.id}`}
                  className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0 hover:text-foreground transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm capitalize">{insp.type?.replaceAll("_", " ") ?? "Inspection"}</p>
                    {insp.unit_number && (
                      <p className="text-xs text-muted-foreground">Unit {insp.unit_number}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {insp.scheduled_date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(insp.scheduled_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {statusPill(INSPECTION_STATUS_PILL, insp.status)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Maintenance */}
        <SectionCard title="Maintenance" viewAllHref={`/maintenance?propertyId=${propertyId}`}>
          {maintenance.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No open maintenance requests.</p>
          ) : (
            <div className="space-y-2">
              {maintenance.map((req) => (
                <Link
                  key={req.id}
                  href={`/maintenance/${req.id}`}
                  className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0 hover:text-foreground transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{req.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.work_order_number ? `#${req.work_order_number}` : ""}
                      {req.unit_number ? ` · Unit ${req.unit_number}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                    </span>
                    {statusPill(MAINTENANCE_STATUS_PILL, req.status)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Bottom row: Compliance + Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Compliance calendar */}
        <SectionCard title="Compliance calendar">
          {complianceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No upcoming compliance dates.</p>
          ) : (
            <div className="space-y-0">
              {complianceItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                  <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", DOT_COLOUR[item.colour])} />
                  <div className="min-w-0 flex-1">
                    {item.link ? (
                      <Link href={item.link} className="text-sm hover:text-brand transition-colors">
                        {item.label}
                      </Link>
                    ) : (
                      <p className="text-sm">{item.label}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                    {new Date(item.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Audit trail */}
        <SectionCard title="Audit trail">
          {auditItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No recent changes recorded.</p>
          ) : (
            <div className="space-y-0">
              {auditItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                  <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-blue-500/50" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {item.action} · <span className="text-muted-foreground capitalize">{item.table_name.replaceAll("_", " ")}</span>
                    </p>
                    {item.changed_by_name && (
                      <p className="text-xs text-muted-foreground">{item.changed_by_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                    {new Date(item.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
