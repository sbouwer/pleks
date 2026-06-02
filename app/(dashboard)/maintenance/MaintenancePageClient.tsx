"use client"

/**
 * app/(dashboard)/maintenance/MaintenancePageClient.tsx — Maintenance request list with sortable table layout
 *
 * Route:  /maintenance
 * Auth:   gateway (dashboard layout)
 * Data:   fetchMaintenanceAction via React Query; sorted/filtered client-side
 * Notes:  Tabs filter by workflow state; columns sortable by title, unit, status, age, urgency.
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { Wrench, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchMaintenanceAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { formatZAR } from "@/lib/constants"

type MaintenanceItem = Awaited<ReturnType<typeof fetchMaintenanceAction>>[number]
type MaintenanceItemExtended = MaintenanceItem & { logged_by?: string; reported_via?: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const URGENCY_DOT: Record<string, string> = {
  emergency: "bg-danger",
  urgent:    "bg-warning",
  routine:   "bg-info",
  cosmetic:  "bg-muted-foreground/40",
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending_review:     { label: "Pending review",  cls: "bg-warning/15 text-warning" },
  approved:           { label: "Approved",         cls: "bg-success/15 text-success" },
  work_order_sent:    { label: "WO sent",          cls: "bg-brand/15 text-brand" },
  acknowledged:       { label: "Acknowledged",     cls: "bg-brand/15 text-brand" },
  in_progress:        { label: "In progress",      cls: "bg-info/15 text-info" },
  pending_completion: { label: "Sign-off",         cls: "bg-warning/15 text-warning" },
  completed:          { label: "Completed",        cls: "bg-success/15 text-success" },
  closed:             { label: "Closed",           cls: "bg-muted text-muted-foreground" },
  rejected:           { label: "Rejected",         cls: "bg-danger/15 text-danger" },
  cancelled:          { label: "Cancelled",        cls: "bg-danger/15 text-danger" },
}

const SLA_HOURS: Record<string, number> = {
  emergency: 4, urgent: 48, routine: 168, cosmetic: 720,
}

type Tab = "all" | "action" | "in_progress" | "completed"
const TABS: { id: Tab; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "action",      label: "Needs action" },
  { id: "in_progress", label: "In progress" },
  { id: "completed",   label: "Completed" },
]

type SortField = "title" | "unit" | "status" | "age" | "urgency"
type SortDir = "asc" | "desc"

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesTab(req: MaintenanceItem, tab: Tab): boolean {
  if (tab === "all") return true
  if (tab === "action") return ["pending_review", "approved", "pending_completion"].includes(req.status)
  if (tab === "in_progress") return ["work_order_sent", "acknowledged", "in_progress"].includes(req.status)
  if (tab === "completed") return ["completed", "closed", "rejected", "cancelled"].includes(req.status)
  return true
}

function getSlaState(req: MaintenanceItem): "ok" | "warning" | "breached" {
  const isTerminal = ["completed", "closed", "rejected", "cancelled"].includes(req.status)
  if (isTerminal) return "ok"
  const ageH = (Date.now() - new Date(req.created_at).getTime()) / 3600000
  const limit = SLA_HOURS[req.urgency ?? "routine"] ?? 168
  if (ageH >= limit) return "breached"
  if (ageH >= limit * 0.75) return "warning"
  return "ok"
}

const URGENCY_ORDER: Record<string, number> = { emergency: 0, urgent: 1, routine: 2, cosmetic: 3 }

function sortList(list: MaintenanceItem[], field: SortField, dir: SortDir): MaintenanceItem[] {
  return [...list].sort((a, b) => {
    let cmp = 0
    if (field === "urgency") {
      cmp = (URGENCY_ORDER[a.urgency ?? "routine"] ?? 2) - (URGENCY_ORDER[b.urgency ?? "routine"] ?? 2)
    } else if (field === "title") {
      cmp = (a.title ?? "").localeCompare(b.title ?? "")
    } else if (field === "unit") {
      const ua = a.units as unknown as { unit_number: string; properties: { name: string } } | null
      const ub = b.units as unknown as { unit_number: string; properties: { name: string } } | null
      cmp = (ua?.properties?.name ?? "").localeCompare(ub?.properties?.name ?? "")
    } else if (field === "status") {
      cmp = a.status.localeCompare(b.status)
    } else {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }
    return dir === "asc" ? cmp : -cmp
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

// ── Sort header ────────────────────────────────────────────────────────────────

function SortIcon({ col, sortField, sortDir }: Readonly<{ col: SortField; sortField: SortField; sortDir: SortDir }>) {
  if (col !== sortField) return <ArrowUpDown className="size-3.5 text-muted-foreground/50 ml-1 inline" />
  return sortDir === "asc"
    ? <ArrowUp className="size-3.5 text-brand ml-1 inline" />
    : <ArrowDown className="size-3.5 text-brand ml-1 inline" />
}

function ColHeader({ col, label, sortField, sortDir, onSort }: Readonly<{
  col: SortField; label: string; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void
}>) {
  return (
    <button type="button" onClick={() => onSort(col)}
      className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
      {label}<SortIcon col={col} sortField={sortField} sortDir={sortDir} />
    </button>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────────

function MaintenanceRow({ req, onClick }: Readonly<{ req: MaintenanceItemExtended; onClick: () => void }>) {
  const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
  const chip = STATUS_CHIP[req.status] ?? { label: req.status.replaceAll("_", " "), cls: "bg-muted text-muted-foreground" }
  const sla = getSlaState(req)
  let dateCls = "text-muted-foreground"
  if (sla === "breached") dateCls = "text-danger font-medium"
  else if (sla === "warning") dateCls = "text-warning"
  const dot = URGENCY_DOT[req.urgency ?? "routine"] ?? "bg-muted-foreground/40"

  return (
    <tr
      className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <td className="px-4 py-3 w-6">
        <div className={`w-2 h-2 rounded-full ${dot}`} />
      </td>
      <td className="px-4 py-3 font-medium text-sm">
        {req.title}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground hidden sm:table-cell whitespace-nowrap">
        {req.work_order_number ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
        {unit ? `${unit.unit_number}, ${unit.properties.name}` : "—"}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>
          {chip.label}
        </span>
      </td>
      <td className={`px-4 py-3 text-xs whitespace-nowrap hidden lg:table-cell ${dateCls}`}>
        {formatDate(req.created_at)}
      </td>
    </tr>
  )
}

// ── Mobile row ─────────────────────────────────────────────────────────────────

function MobileRow({ req }: Readonly<{ req: MaintenanceItemExtended }>) {
  const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
  const chip = STATUS_CHIP[req.status] ?? { label: req.status.replaceAll("_", " "), cls: "bg-muted text-muted-foreground" }
  const dot = URGENCY_DOT[req.urgency ?? "routine"] ?? "bg-muted-foreground/40"

  return (
    <Link href={`/maintenance/${req.id}`} className="flex items-center gap-2.5 px-1 py-2.5 border-b border-border/50 last:border-0">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{req.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
          {req.work_order_number ? ` · ${req.work_order_number}` : ""}
        </p>
      </div>
      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
    </Link>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { orgId: string }

export function MaintenancePageClient({ orgId }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.maintenance(orgId)
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const [sortField, setSortField] = useState<SortField>("age")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchMaintenanceAction(orgId),
    staleTime: STALE_TIME.maintenance,
  })

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const emergencies = list.filter(r => r.urgency === "emergency" && !["completed", "closed", "cancelled", "rejected"].includes(r.status))
  const tabFiltered = list.filter(r => matchesTab(r, activeTab))
  const filtered = sortList(tabFiltered, sortField, sortDir) as MaintenanceItemExtended[]
  const actionCount = list.filter(r => matchesTab(r, "action")).length

  return (
    <div>
      {/* ── Mobile ───────────────────────────────────────────────────────── */}
      <div className="lg:hidden pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-heading text-2xl">Maintenance</h1>
            {list.length > 0 && <p className="text-xs text-muted-foreground">{list.length} total</p>}
          </div>
          <AddButton label="Log" onClick={() => router.push("/maintenance/new")} />
        </div>

        {emergencies.length > 0 && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 mb-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-danger">
              {emergencies.length} emergency{emergencies.length > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {list.length === 0 ? (
          <EmptyResourceState
            emptyTitle="No maintenance requests"
            emptySub="Log a request to get started."
            icon={<Wrench className="h-6 w-6" />}
            heroAction={<AddButton label="Log request" showPlus={false} onClick={() => router.push("/maintenance/new")} />}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface-elevated px-3">
            {sortList(list, "age", "desc").map(req => (
              <MobileRow key={req.id} req={req as MaintenanceItemExtended} />
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <ResourcePageHeader
          eyebrow="Operations"
          title="Maintenance"
          headline="Maintenance requests"
          sub={
            (list.length > 0 || dataUpdatedAt > 0) ? (
              <div className="space-y-0.5">
                {list.length > 0 && (
                  <p>
                    {list.length} request{list.length !== 1 ? "s" : ""}
                    {emergencies.length > 0 && ` · ${emergencies.length} emergency`}
                    {actionCount > 0 && ` · ${actionCount} need action`}
                  </p>
                )}
                {dataUpdatedAt > 0 && (
                  <span className="flex items-center gap-2 text-xs">
                    Updated {relativeTime(new Date(dataUpdatedAt))}
                    <button type="button" className="pa-link" onClick={() => queryClient.invalidateQueries({ queryKey })}>Refresh</button>
                  </span>
                )}
              </div>
            ) : undefined
          }
          action={<AddButton label="Log request" onClick={() => router.push("/maintenance/new")} />}
        />

        {emergencies.length > 0 && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 mb-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-danger">{emergencies.length} emergency{emergencies.length > 1 ? "s" : ""} · </span>
              {emergencies.map((e, i) => {
                const unit = e.units as unknown as { unit_number: string; properties: { name: string } } | null
                return (
                  <Link key={e.id} href={`/maintenance/${e.id}`} className="text-sm text-danger/80 hover:underline">
                    {i > 0 ? ", " : ""}{e.title}{unit ? ` (${unit.unit_number})` : ""}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        {list.length > 0 && (
          <div className="flex gap-1 mb-4 border-b border-border/60">
            {TABS.map(tab => {
              const count = tab.id === "action" ? actionCount : 0
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === tab.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="h-4.5 min-w-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-semibold flex items-center justify-center">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {list.length === 0 && (
          <EmptyResourceState
            emptyTitle="No maintenance requests"
            emptySub="Log a maintenance request to get started."
            icon={<Wrench className="h-6 w-6" />}
            heroAction={<AddButton label="Log request" showPlus={false} onClick={() => router.push("/maintenance/new")} />}
          />
        )}
        {list.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No requests in this category.</p>
        )}
        {list.length > 0 && filtered.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 w-6" />
                  <th className="px-4 py-2.5 text-left">
                    <ColHeader col="title" label="Title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell whitespace-nowrap">
                    <span className="text-xs font-medium text-muted-foreground">WO #</span>
                  </th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">
                    <ColHeader col="unit" label="Unit / Property" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColHeader col="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                    <ColHeader col="age" label="Date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => (
                  <MaintenanceRow
                    key={req.id}
                    req={req}
                    onClick={() => router.push(`/maintenance/${req.id}`)}
                  />
                ))}
              </tbody>
            </table>

            {/* Cost summary for completed */}
            {activeTab === "completed" && (() => {
              type WithCost = typeof filtered[number] & { actual_cost_cents?: number }
              const total = (filtered as WithCost[]).reduce((s, r) => s + (r.actual_cost_cents ?? 0), 0)
              return total > 0 ? (
                <div className="px-4 py-2.5 border-t border-border/60 text-xs text-muted-foreground">
                  Total actual cost: {formatZAR(total)}
                </div>
              ) : null
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
