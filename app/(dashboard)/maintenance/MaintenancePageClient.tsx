"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Wrench, Plus, AlertTriangle, ChevronRight } from "lucide-react"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchMaintenanceAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { formatZAR } from "@/lib/constants"

// ── Types ─────────────────────────────────────────────────

type MaintenanceItem = Awaited<ReturnType<typeof fetchMaintenanceAction>>[number]
type MaintenanceItemExtended = MaintenanceItem & { logged_by?: string; reported_via?: string }

// ── Constants ─────────────────────────────────────────────

const URGENCY_DOT: Record<string, string> = {
  emergency: "bg-danger",
  urgent: "bg-warning",
  routine: "bg-info",
  cosmetic: "bg-muted-foreground/40",
}

const URGENCY_LABEL: Record<string, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  routine: "Routine",
  cosmetic: "Cosmetic",
}

const STATUS_DISPLAY: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  pending_landlord: "Awaiting landlord",
  landlord_approved: "Landlord approved",
  landlord_rejected: "Landlord rejected",
  rejected: "Rejected",
  work_order_sent: "Work order sent",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  pending_completion: "Awaiting sign-off",
  completed: "Completed",
  tenant_notified: "Tenant notified",
  closed: "Closed",
  cancelled: "Cancelled",
}

// SLA thresholds in hours
const SLA_HOURS: Record<string, number> = {
  emergency: 4,
  urgent: 48,
  routine: 168, // 7 days
  cosmetic: 720, // 30 days
}

type Tab = "all" | "action" | "in_progress" | "awaiting" | "completed" | "tenant"

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "action", label: "Needs action" },
  { id: "in_progress", label: "In progress" },
  { id: "awaiting", label: "Awaiting approval" },
  { id: "completed", label: "Completed" },
  { id: "tenant", label: "Tenant reported" },
]

function matchesTab(req: MaintenanceItem, tab: Tab): boolean {
  if (tab === "all") return true
  if (tab === "action") return ["pending_review", "approved", "pending_completion"].includes(req.status)
  if (tab === "in_progress") return ["work_order_sent", "acknowledged", "in_progress"].includes(req.status)
  if (tab === "awaiting") return req.status === "pending_landlord"
  if (tab === "completed") return ["completed", "closed", "tenant_notified", "rejected", "cancelled"].includes(req.status)
  if (tab === "tenant") return (req as MaintenanceItemExtended).logged_by === "tenant"
  return true
}

function getSlaAge(req: MaintenanceItem) {
  const ageHours = (Date.now() - new Date(req.created_at).getTime()) / (1000 * 60 * 60)
  const threshold = SLA_HOURS[req.urgency ?? "routine"] ?? 168
  if (ageHours >= threshold) return "breached"
  if (ageHours >= threshold * 0.75) return "warning"
  return "ok"
}

function sortRequests(list: MaintenanceItem[]) {
  const urgencyOrder: Record<string, number> = { emergency: 0, urgent: 1, routine: 2, cosmetic: 3 }
  return [...list].sort((a, b) => {
    const ua = urgencyOrder[a.urgency ?? "routine"] ?? 2
    const ub = urgencyOrder[b.urgency ?? "routine"] ?? 2
    if (ua !== ub) return ua - ub
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// ── Card ──────────────────────────────────────────────────

function MaintenanceCard({ req }: Readonly<{ req: MaintenanceItemExtended }>) {
  const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
  const slaAge = getSlaAge(req)
  const isTerminal = ["completed", "closed", "tenant_notified", "rejected", "cancelled"].includes(req.status)

  let urgencyClass = "text-muted-foreground"
  if (req.urgency === "emergency") urgencyClass = "text-danger"
  else if (req.urgency === "urgent") urgencyClass = "text-warning"

  let slaClass = "text-muted-foreground"
  if (slaAge === "breached") slaClass = "text-danger font-medium"
  else if (slaAge === "warning") slaClass = "text-warning"

  let slaPrefix = ""
  if (slaAge === "breached") slaPrefix = "⚠ SLA breached · "
  else if (slaAge === "warning") slaPrefix = "⏱ SLA at risk · "

  return (
    <Link href={`/maintenance/${req.id}`} className="block">
      <div className="group rounded-xl border border-border/60 bg-surface-elevated px-4 py-3.5 hover:border-brand/40 transition-colors">
        <div className="flex items-start gap-3">
          {/* Priority dot */}
          <div className="pt-1 shrink-0">
            <div className={`h-2.5 w-2.5 rounded-full ${URGENCY_DOT[req.urgency ?? "routine"] ?? "bg-muted-foreground/40"}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{req.title}</p>
                  {req.work_order_number && (
                    <span className="text-xs text-muted-foreground shrink-0">{req.work_order_number}</span>
                  )}
                  {req.reported_via === "portal" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 shrink-0">
                      via portal
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                  {req.category ? ` · ${req.category.replace(/_/g, " ")}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Status */}
              <span className="text-xs text-muted-foreground">{STATUS_DISPLAY[req.status] ?? req.status}</span>

              {/* Urgency (only show if non-routine or non-terminal) */}
              {req.urgency && req.urgency !== "routine" && !isTerminal && (
                <span className={`text-xs font-medium uppercase ${urgencyClass}`}>
                  {URGENCY_LABEL[req.urgency]}
                </span>
              )}

              {/* SLA indicator (only for open requests) */}
              {!isTerminal && (
                <span className={`text-xs ${slaClass}`}>
                  {slaPrefix}
                  {relativeTime(new Date(req.created_at))}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Main component ─────────────────────────────────────────

interface Props { orgId: string }

export function MaintenancePageClient({ orgId }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.maintenance(orgId)
  const [activeTab, setActiveTab] = useState<Tab>("all")

  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchMaintenanceAction(orgId),
    staleTime: STALE_TIME.maintenance,
  })

  const emergencies = list.filter(
    (r) => r.urgency === "emergency" && !["completed", "closed", "cancelled", "rejected"].includes(r.status)
  )

  const filtered = sortRequests(list.filter((r) => matchesTab(r, activeTab)))
  const actionCount = list.filter((r) => matchesTab(r, "action")).length
  const awaitingCount = list.filter((r) => matchesTab(r, "awaiting")).length
  const tenantCount = list.filter((r) => matchesTab(r, "tenant")).length

  const overdueSlaCount = list.filter((r) => {
    const terminal = ["completed", "closed", "tenant_notified", "rejected", "cancelled"]
    return !terminal.includes(r.status) && getSlaAge(r) === "breached"
  }).length

  const mobileList = sortRequests(list.filter((r) =>
    !["completed", "closed", "rejected", "cancelled"].includes(r.status)
  ))

  return (
    <div>
      {/* ─── Mobile view ─── */}
      <div className="lg:hidden space-y-3 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl">Maintenance</h1>
            {list.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {mobileList.length} open · {list.length} total
              </p>
            )}
          </div>
          <Button size="sm" render={<Link href="/maintenance/new" />}>
            <Plus className="h-4 w-4 mr-1" /> Log
          </Button>
        </div>

        {emergencies.length > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger-bg px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-danger">
                {emergencies.length} emergency{emergencies.length > 1 ? "s" : ""}
              </p>
              {emergencies.map((e) => {
                const unit = e.units as unknown as { unit_number: string; properties: { name: string } } | null
                return (
                  <Link key={e.id} href={`/maintenance/${e.id}`} className="text-xs text-danger/80 hover:underline block">
                    {e.title}{unit ? ` — ${unit.unit_number}` : ""}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-8 w-8 text-muted-foreground" />}
            title="No maintenance requests"
            description="Log a maintenance request to get started."
          />
        ) : (
          <div className="space-y-2">
            {mobileList.map((req) => <MaintenanceCard key={req.id} req={req as MaintenanceItemExtended} />)}
            {list.filter((r) => ["completed", "closed", "rejected", "cancelled"].includes(r.status)).length > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{list.filter((r) => ["completed", "closed", "rejected", "cancelled"].includes(r.status)).length} completed — view on desktop
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── Desktop view ─── */}
      <div className="hidden lg:block">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Maintenance</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {list.length} request{list.length !== 1 ? "s" : ""}
              {emergencies.length > 0 && ` · ${emergencies.length} emergency`}
              {overdueSlaCount > 0 && ` · ${overdueSlaCount} overdue`}
            </p>
          )}
          {dataUpdatedAt > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>Updated {relativeTime(new Date(dataUpdatedAt))}</span>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey })}
                className="text-brand hover:underline"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
        <Button render={<Link href="/maintenance/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Log request
        </Button>
      </div>

      {/* ─── Emergency banner ─── */}
      {emergencies.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 mb-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-danger">
              {emergencies.length} emergency request{emergencies.length > 1 ? "s" : ""} require immediate attention
            </p>
            {emergencies.map((e) => {
              const unit = e.units as unknown as { unit_number: string; properties: { name: string } } | null
              return (
                <Link key={e.id} href={`/maintenance/${e.id}`} className="text-xs text-danger/80 hover:underline block mt-0.5">
                  {e.title}{unit ? ` — ${unit.unit_number}, ${unit.properties.name}` : ""}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Filter tabs ─── */}
      {list.length > 0 && (
        <div className="flex gap-1 mb-4 border-b border-border/60">
          {TABS.map((tab) => {
            let badge: number
            if (tab.id === "action") { badge = actionCount }
            else if (tab.id === "awaiting") { badge = awaitingCount }
            else if (tab.id === "tenant") { badge = tenantCount }
            else { badge = 0 }
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "border-brand text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {badge > 0 && (
                  <span className="h-4.5 min-w-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-semibold flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ─── List ─── */}
      {(() => {
        if (list.length === 0) {
          return (
            <EmptyState
              icon={<Wrench className="h-8 w-8 text-muted-foreground" />}
              title="No maintenance requests"
              description="Log a maintenance request to get started."
            />
          )
        }
        if (filtered.length === 0) {
          return <p className="text-sm text-muted-foreground py-4">No requests in this category.</p>
        }
        return (
          <div className="space-y-2">
            {filtered.map((req) => <MaintenanceCard key={req.id} req={req as MaintenanceItemExtended} />)}
          </div>
        )
      })()}

      {/* Cost summary for completed tab */}
      {activeTab === "completed" && filtered.length > 0 && (() => {
        type ReqWithCost = typeof filtered[number] & { actual_cost_cents?: number }
        const total = (filtered as ReqWithCost[]).reduce((sum, r) => sum + (r.actual_cost_cents ?? 0), 0)
        return total > 0 ? (
          <p className="text-xs text-muted-foreground mt-4">
            Total actual cost: {formatZAR(total)}
          </p>
        ) : null
      })()}
      </div>{/* end desktop */}
    </div>
  )
}
