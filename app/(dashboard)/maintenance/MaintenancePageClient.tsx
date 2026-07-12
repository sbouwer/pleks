"use client"

/**
 * app/(dashboard)/maintenance/MaintenancePageClient.tsx — Maintenance request list with sortable table layout
 *
 * Route:  /maintenance
 * Auth:   gateway (dashboard layout)
 * Data:   fetchMaintenanceAction via React Query; sorted/filtered client-side
 * Notes:  Tabs filter by workflow state; columns sortable by title, unit, status, age, urgency.
 *         Desktop fill-scrolls: root + desktop column are flex-h-full/flex-1 so the list scrolls
 *         INSIDE the ListCard (sticky thead) and the page itself doesn't scroll. List/Cards toggle
 *         switches the table for a card grid; the bespoke ColHeader sort drives both.
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AddButton } from "@/components/ui/add-button"
import { WarningBell } from "@/components/ui/WarningBell"
import { WarningListModal, type WarningItem } from "@/components/ui/WarningListModal"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { ListToolbar, ToolbarFilter, ListCard, type ListView } from "@/components/ui/resource-list"
import { useUser } from "@/hooks/useUser"
import { useMyTeams } from "@/hooks/useMyTeams"
import { useShowScopeFilter } from "@/hooks/useShowScopeFilter"
import { isMine } from "@/lib/work/myWorkFilter"
import { isPastDate } from "@/lib/work/overdue"
import { Wrench, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, User, Users, Globe } from "lucide-react"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchMaintenanceAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { formatZAR } from "@/lib/constants"
import { SA_TIMEZONE, fmtZA } from "@/lib/dates"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"

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

// Status compartment (single-select) — each option is a workflow-state group resolved by matchesTab().
type Tab = "all" | "action" | "in_progress" | "completed"
const STATUS_OPTIONS: { value: Tab; label: string }[] = [
  { value: "all",         label: "All" },
  { value: "action",      label: "Needs action" },
  { value: "in_progress", label: "In progress" },
  { value: "completed",   label: "Completed" },
]

// Urgency compartment (multi-select) — urgency values from maintenance_requests (URGENCY_DOT/URGENCY_ORDER).
const URGENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "emergency", label: "Emergency" },
  { value: "urgent",    label: "Urgent" },
  { value: "routine",   label: "Routine" },
  { value: "cosmetic",  label: "Cosmetic" },
]

type SortField = "title" | "supplier" | "unit" | "status" | "age" | "urgency"
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
    } else if (field === "supplier") {
      // Assigned contractors sort alphabetically; unassigned ("") always sorts last on asc.
      const sa = supplierNameOf(a), sb = supplierNameOf(b)
      if (sa && sb) cmp = sa.localeCompare(sb)
      else if (sa) cmp = -1
      else if (sb) cmp = 1
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
  const d = new Date(iso)
  const base = fmtZA(d, { day: "numeric", month: "short" })
  const yy = (d.getFullYear() % 100).toString().padStart(2, "0")
  return `${base} '${yy}`
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

/** Assigned supplier's display name (company first, else person), or "" when unassigned. */
function supplierNameOf(req: MaintenanceItem): string {
  const c = (req as { contractor_view?: { first_name?: string; last_name?: string; company_name?: string } | null }).contractor_view
  if (!c) return ""
  return c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ")
}

function MaintenanceRow({ req, onClick }: Readonly<{ req: MaintenanceItemExtended; onClick: () => void }>) {
  const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
  const supplierName = supplierNameOf(req)
  const unitLabel = formatPropertyLabel(unit, { fallback: "—" })
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
        <div className="max-w-[180px] truncate" title={req.title}>{req.title}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
        <div className="max-w-[150px] truncate" title={supplierName || undefined}>{supplierName || "—"}</div>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground hidden lg:table-cell whitespace-nowrap">
        {req.work_order_number ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
        <div className="max-w-[150px] truncate" title={unitLabel}>{unitLabel}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>
          {chip.label}
        </span>
      </td>
      <td className={`pl-4 pr-6 py-3 text-xs whitespace-nowrap hidden lg:table-cell ${dateCls}`}>
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
          {formatPropertyLabel(unit, { fallback: "" })}
          {req.work_order_number ? ` · ${req.work_order_number}` : ""}
        </p>
      </div>
      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
    </Link>
  )
}

// ── Card tile (the "Cards" toggle) ───────────────────────────────────────────────

/** Card-view tile — mirrors the list row's data (title · unit/property · status · urgency · contractor). */
function MaintenanceCard({ req, onClick }: Readonly<{ req: MaintenanceItemExtended; onClick: () => void }>) {
  const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
  const supplierName = supplierNameOf(req)
  const unitLabel = formatPropertyLabel(unit, { fallback: "—" })
  const chip = STATUS_CHIP[req.status] ?? { label: req.status.replaceAll("_", " "), cls: "bg-muted text-muted-foreground" }
  const dot = URGENCY_DOT[req.urgency ?? "routine"] ?? "bg-muted-foreground/40"

  return (
    <div
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} title={req.urgency ?? "routine"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={req.title}>{req.title}</p>
            <p className="truncate text-xs text-muted-foreground" title={unitLabel}>{unitLabel}</p>
          </div>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium ${chip.cls}`}>
          {chip.label}
        </span>
      </div>

      <div className="text-xs text-muted-foreground">
        {supplierName ? (
          <p className="truncate" title={supplierName}>{supplierName}</p>
        ) : (
          <p className="text-muted-foreground/40">Unassigned</p>
        )}
        {req.work_order_number && <p className="font-mono text-[11px]">{req.work_order_number}</p>}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { orgId: string; contractorFilter?: string | null; contractorName?: string | null }

export function MaintenancePageClient({ orgId, contractorFilter, contractorName }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useUser()
  const { teams, teamIds } = useMyTeams()
  const currentUserId = user?.id ?? null
  const queryKey = OPERATIONAL_QUERY_KEYS.maintenance(orgId)
  const [scope, setScope] = useState<"mine" | "all" | `team:${string}`>("mine")
  const showScope = useShowScopeFilter()  // View filter only from Growth up; below that, everything is "all"
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const [urgencies, setUrgencies] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [view, setView] = useState<ListView>("list")
  const [sortField, setSortField] = useState<SortField>("age")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const { data: allItems = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchMaintenanceAction(orgId),
    staleTime: STALE_TIME.maintenance,
  })

  // Overdue = an open request whose scheduled date has passed (terminal states excluded).
  const [showOverdue, setShowOverdue] = useState(false)
  const overdueItems: WarningItem[] = allItems
    .filter((req) => {
      const r = req as { status: string; scheduled_date?: string | null }
      const terminal = ["completed", "closed", "rejected", "cancelled"].includes(r.status)
      return !terminal && isPastDate(r.scheduled_date)
    })
    .map((req) => {
      const r = req as { id: string; title?: string | null; scheduled_date?: string | null }
      return {
        id: r.id,
        title: r.title ?? "Maintenance request",
        sub: r.scheduled_date ? `scheduled ${new Date(r.scheduled_date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}` : undefined,
        href: `/maintenance/${r.id}`,
      }
    })
  // My work / All (ADDENDUM_TEAMS Layer 0) — flat client-side predicate; null assignee = Everyone/Org,
  // shown only under "All". Falls back to All until the current user resolves.
  const effScope = showScope ? scope : "all"
  let scopeFiltered = allItems
  if (effScope === "mine" && currentUserId) {
    scopeFiltered = allItems.filter((r) => isMine(r as { assigned_user_id: string | null; assigned_team_id: string | null }, currentUserId, teamIds))
  } else if (effScope.startsWith("team:")) {
    const tid = effScope.slice(5)
    scopeFiltered = allItems.filter((r) => (r as { assigned_team_id?: string | null }).assigned_team_id === tid)
  }
  // Optional ?contractor= scope (e.g. from a supplier's "View work orders" quick link).
  const list = contractorFilter
    ? scopeFiltered.filter((r) => (r as { contractor_id?: string | null }).contractor_id === contractorFilter)
    : scopeFiltered

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const emergencies = list.filter(r => r.urgency === "emergency" && !["completed", "closed", "cancelled", "rejected"].includes(r.status))
  // Search by title / WO number / unit / property name + address (street line, suburb, town) / supplier.
  const q = search.trim().toLowerCase()
  const searched = q
    ? list.filter((r) => {
        const u = r.units as unknown as { unit_number?: string; properties?: { name?: string; address_line1?: string; suburb?: string; city?: string } } | null
        const p = u?.properties
        return [r.title, r.work_order_number, u?.unit_number, p?.name, p?.address_line1, p?.suburb, p?.city, supplierNameOf(r)]
          .filter(Boolean).join(" ").toLowerCase().includes(q)
      })
    : list
  const tabFiltered = searched.filter(r => matchesTab(r, activeTab))
  const urgencyFiltered = urgencies.length > 0
    ? tabFiltered.filter(r => urgencies.includes(r.urgency ?? "routine"))
    : tabFiltered
  const filtered = sortList(urgencyFiltered, sortField, sortDir) as MaintenanceItemExtended[]
  const actionCount = list.filter(r => matchesTab(r, "action")).length

  // Scoped list (after My work / contractor) is empty while the org has items → the "nothing assigned to
  // you, view all" card. A non-empty scoped list with no matches → a plain search/category line.
  const nothingAssignedToMe = allItems.length > 0 && effScope === "mine" && list.length === 0
  const emptyListMessage = q ? "No requests match your search." : "No requests in this category."

  // Supplier-scoped view (from a supplier's "View work orders" link). On desktop it rides on the right
  // of the tab row (filterNotice); on mobile / the empty state it's a boxed banner below the header.
  // It must NOT sit above the page header — that's sticky with a negative top margin (clips) and the
  // search bar has a scroll-fade mask over its top edge.
  const supplierLabel = <span className="font-semibold text-foreground">{contractorName || "this supplier"}</span>
  const filterNotice = contractorFilter ? (
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Wrench className="h-3.5 w-3.5 shrink-0 text-brand" />
      <span className="truncate">Showing work orders for {supplierLabel}</span>
      <button type="button" onClick={() => router.push("/maintenance")} className="shrink-0 text-brand hover:underline">Show all</button>
    </span>
  ) : null
  const filterBanner = contractorFilter ? (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-2">
      {filterNotice}
    </div>
  ) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Mobile ───────────────────────────────────────────────────────── */}
      <div className="lg:hidden flex min-h-0 flex-1 flex-col pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-heading text-2xl">Maintenance</h1>
            {list.length > 0 && <p className="text-xs text-muted-foreground">{list.length} total</p>}
          </div>
          <AddButton label="Log" onClick={() => router.push("/maintenance/new")} />
        </div>

        {filterBanner}

        {emergencies.length > 0 && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 mb-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-danger">
              {emergencies.length} emergency{emergencies.length > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {allItems.length === 0 && (
          <EmptyResourceState
            emptyTitle="No maintenance requests"
            emptySub="Log a request to get started."
            icon={<Wrench className="h-6 w-6" />}
            heroAction={<AddButton label="Log request" showPlus={false} onClick={() => router.push("/maintenance/new")} />}
          />
        )}
        {nothingAssignedToMe && (
          <EmptyResourceState
            emptyTitle="Nothing assigned to you"
            emptySub="There's maintenance in your organisation — just none assigned to you right now."
            icon={<Wrench className="h-6 w-6" />}
            heroAction={<AddButton label="View all" showPlus={false} onClick={() => setScope("all")} />}
          />
        )}
        {list.length > 0 && (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface-elevated px-3">
            {sortList(list, "age", "desc").map(req => (
              <MobileRow key={req.id} req={req as MaintenanceItemExtended} />
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex min-h-0 flex-1 flex-col gap-4">
        <ResourcePageHeader
          eyebrow="Operations"
          title="Maintenance"
          headline="Maintenance requests"
          sub={
            (list.length > 0 || dataUpdatedAt > 0) ? (
              <div className="space-y-0.5">
                {/* Always render the count (even "0 requests") so toggling the filter doesn't pop the
                    line in/out and jump the sticky header. */}
                <p>
                  {list.length} request{list.length !== 1 ? "s" : ""}
                  {emergencies.length > 0 && ` · ${emergencies.length} emergency`}
                  {actionCount > 0 && ` · ${actionCount} need action`}
                </p>
                {dataUpdatedAt > 0 && (
                  <span className="flex items-center gap-2 text-xs">
                    Updated {relativeTime(new Date(dataUpdatedAt))}
                    <button type="button" className="pa-link" onClick={() => queryClient.invalidateQueries({ queryKey })}>Refresh</button>
                  </span>
                )}
              </div>
            ) : undefined
          }
          action={
            <div className="flex items-center gap-2">
              <WarningBell
                count={overdueItems.length}
                label={`${overdueItems.length} overdue request${overdueItems.length === 1 ? "" : "s"}`}
                onClick={() => setShowOverdue(true)}
              />
              <AddButton label="Log request" onClick={() => router.push("/maintenance/new")} />
            </div>
          }
        />
        <WarningListModal open={showOverdue} onClose={() => setShowOverdue(false)} title="Overdue maintenance" items={overdueItems} />

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

        {/* Joint toolbar: view (my work/all) · status · urgency · search · List/Cards toggle. Gated on
            allItems (not the scoped list) so the View toggle stays reachable when My-work is empty. */}
        {allItems.length > 0 && (
          <div className="space-y-2">
            <ListToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search by title, unit, property, address or contractor…"
              view={view}
              onView={setView}
              rightFilters={
                showScope ? (
                  <ToolbarFilter
                    label="View"
                    selected={[scope]}
                    onChange={(next) => setScope((next[0] as "mine" | "all" | `team:${string}`) ?? "mine")}
                    options={[
                      { value: "mine", label: "My work", icon: <User /> },
                      { value: "all", label: "All", icon: <Globe /> },
                      ...teams.map((t) => ({ value: `team:${t.id}`, label: t.name, icon: <Users /> })),
                    ]}
                  />
                ) : null
              }
              filters={
                <>
                  <ToolbarFilter
                    label="Status"
                    selected={[activeTab]}
                    onChange={(next) => setActiveTab((next[0] as Tab) ?? "all")}
                    options={STATUS_OPTIONS}
                  />
                  <ToolbarFilter
                    label="Urgency"
                    multiple
                    selected={urgencies}
                    onChange={setUrgencies}
                    options={URGENCY_OPTIONS}
                  />
                </>
              }
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                {filtered.length} of {list.length} request{list.length !== 1 ? "s" : ""}
                {actionCount > 0 && ` · ${actionCount} need action`}
              </p>
              {filterNotice}
            </div>
          </div>
        )}

        {/* No tabs to ride on when the scoped supplier has zero work orders — fall back to the boxed banner. */}
        {list.length === 0 && filterBanner}

        {allItems.length === 0 && (
          <EmptyResourceState
            emptyTitle="No maintenance requests"
            emptySub="Log a maintenance request to get started."
            icon={<Wrench className="h-6 w-6" />}
            heroAction={<AddButton label="Log request" showPlus={false} onClick={() => router.push("/maintenance/new")} />}
          />
        )}
        {nothingAssignedToMe && (
          <EmptyResourceState
            emptyTitle="Nothing assigned to you"
            emptySub="There's maintenance in your organisation — just none assigned to you right now."
            icon={<Wrench className="h-6 w-6" />}
            heroAction={<AddButton label="View all" showPlus={false} onClick={() => setScope("all")} />}
          />
        )}
        {!nothingAssignedToMe && list.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">{emptyListMessage}</p>
        )}
        {allItems.length > 0 && filtered.length > 0 && view === "list" && (
          <ListCard fill>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 w-6" />
                  <th className="px-4 py-2.5 text-left">
                    <ColHeader col="title" label="Title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell">
                    <ColHeader col="supplier" label="Contractor" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell whitespace-nowrap">
                    <span className="text-xs font-medium text-muted-foreground">WO #</span>
                  </th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">
                    <ColHeader col="unit" label="Unit / Property" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColHeader col="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="pl-4 pr-6 py-2.5 text-left hidden lg:table-cell">
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
          </ListCard>
        )}

        {allItems.length > 0 && filtered.length > 0 && view === "cards" && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(req => (
              <MaintenanceCard
                key={req.id}
                req={req}
                onClick={() => router.push(`/maintenance/${req.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
