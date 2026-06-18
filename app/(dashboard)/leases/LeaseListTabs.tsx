"use client"

/**
 * app/(dashboard)/leases/LeaseListTabs.tsx — Lease list with shared ListToolbar (status filter + search + view toggle) and footer metrics
 *
 * Route:  /leases
 * Auth:   gateway (dashboard layout)
 * Data:   SerializedLease array from LeasesPageClient
 * Notes:  Status filter values mirror the lease status groupings used across the list
 *         (active/month_to_month, notice, expiring-soon, draft/pending_signing, all).
 *         Search matches tenant/co-tenant names, property name and unit number.
 *         Fill-scroll: root is flex min-h-0 flex-1; the list/grid scrolls inside the
 *         ListCard fill (sticky header), and LeaseListFooter stays below it as an
 *         auto-height (shrink-0) row so the metrics remain visible without page scroll.
 */
import { useState, useMemo } from "react"
import Link from "next/link"
import { EmptyState } from "@/components/shared/EmptyState"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { AddButton } from "@/components/ui/add-button"
import { FileText } from "lucide-react"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { useMyPortfolio } from "@/hooks/useMyPortfolio"
import { useShowScopeFilter } from "@/hooks/useShowScopeFilter"
import { LeaseRow, type SerializedLease } from "./LeaseRow"
import { LeaseListFooter } from "./LeaseListFooter"
import { isExpiringSoon, getExpiryUrgency, getExpiryColor } from "@/lib/leases/expiringLogic"
import { buildTenantDisplay } from "@/lib/leases/tenantDisplay"
import { isInForceLease } from "@/lib/leases/rentRoll"
import { formatZAR } from "@/lib/constants"

type StatusFilter = "active" | "notice" | "expiring" | "draft" | "all"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active",   label: "Active" },
  { value: "notice",   label: "Notice" },
  { value: "expiring", label: "Expiring soon" },
  { value: "draft",    label: "Draft" },
  { value: "all",      label: "All" },
]

const STATUS_STYLES: Record<string, string> = {
  active:          "bg-emerald-600 text-white",
  month_to_month:  "bg-emerald-600 text-white",
  notice:          "bg-purple-600 text-white",
  draft:           "bg-slate-700 text-white",
  pending_signing: "bg-amber-500 text-white",
  expired:         "bg-red-600 text-white",
  cancelled:       "bg-red-600 text-white",
}
const STATUS_LABELS: Record<string, string> = {
  active: "Active", month_to_month: "MTM", notice: "Notice",
  draft: "Draft", pending_signing: "Pending", expired: "Expired", cancelled: "Cancelled",
}

function filterByStatus(leases: SerializedLease[], tab: StatusFilter): SerializedLease[] {
  switch (tab) {
    case "active":
      return leases.filter((l) => ["active", "month_to_month"].includes(l.status))
    case "notice":
      return leases.filter((l) => l.status === "notice")
    case "expiring":
      return leases.filter((l) =>
        ["active", "month_to_month"].includes(l.status) && isExpiringSoon(l)
      )
    case "draft":
      return leases.filter((l) => ["draft", "pending_signing"].includes(l.status))
    case "all":
      return leases
  }
}

function leaseSearchHaystack(lease: SerializedLease): string {
  const tv = lease.tenant_view
  const tenantName = tv
    ? `${tv.company_name ?? ""} ${tv.first_name ?? ""} ${tv.last_name ?? ""}`
    : ""
  const coTenantNames = lease.lease_co_tenants
    .map((ct) => {
      const c = ct.tenants?.contacts
      return c ? `${c.company_name ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""}` : ""
    })
    .join(" ")
  const unit = lease.units
  const unitText = unit ? `${unit.unit_number} ${unit.properties.name} ${unit.properties.suburb ?? ""} ${unit.properties.city ?? ""}` : ""
  return `${tenantName} ${coTenantNames} ${unitText}`.toLowerCase()
}

type LeaseSortKey = "property" | "tenant" | "rent" | "term" | "status"

function leaseTenantName(lease: SerializedLease): string {
  const tv = lease.tenant_view
  return (tv?.company_name || `${tv?.first_name ?? ""} ${tv?.last_name ?? ""}`).trim().toLowerCase()
}

/** Card-view tile (the "Cards" toggle) — mirrors the row's derived data: tenant, property/unit, rent, term, status. */
function LeaseCard({ lease }: Readonly<{ lease: SerializedLease }>) {
  const tv = lease.tenant_view
  const primary = {
    id: tv?.id ?? lease.tenant_id,
    firstName: tv?.first_name,
    lastName: tv?.last_name,
    companyName: tv?.company_name,
    entityType: tv?.entity_type,
  }
  const coTenantInputs = lease.lease_co_tenants
    .filter((ct) => ct.tenants)
    .map((ct) => ({
      id: ct.tenants!.id,
      firstName: ct.tenants!.contacts?.first_name ?? null,
      lastName: ct.tenants!.contacts?.last_name ?? null,
      companyName: ct.tenants!.contacts?.company_name ?? null,
      entityType: ct.tenants!.contacts?.entity_type ?? "individual",
    }))
  const display = buildTenantDisplay(primary, coTenantInputs)
  const hasCoTenants = display.coTenants.length > 0

  const unit = lease.units
  const propertyLabel = unit ? `${unit.unit_number} — ${unit.properties.name}` : "No unit"

  const now = new Date()
  let termLabel = "Month to month"
  if (lease.start_date && lease.end_date) {
    const start = new Date(lease.start_date)
    const end = new Date(lease.end_date)
    const fmt = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" })
    termLabel = `${fmt(start)} → ${fmt(end)}`
  }

  const urgency = getExpiryUrgency(lease)
  const color = getExpiryColor(urgency)
  let remainingLabel = ""
  if (lease.end_date) {
    const end = new Date(lease.end_date)
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
    remainingLabel = urgency === "expired" ? "Expired" : `${daysRemaining}d remaining`
  }

  return (
    <Link
      href={`/leases/${lease.id}`}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{display.displayText}</p>
          <p className={`text-[11px] ${lease.hasArrears ? "text-red-500" : "text-muted-foreground"}`}>
            {hasCoTenants ? "Tenants" : "Tenant"}
            {lease.hasArrears ? " · Arrears" : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLES[lease.status] ?? STATUS_STYLES.draft}`}>
          {STATUS_LABELS[lease.status] ?? lease.status}
        </span>
      </div>

      <p className="truncate text-xs text-muted-foreground">{propertyLabel}</p>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[15px] font-medium">{formatZAR(lease.rent_amount_cents)}</p>
          <p className="text-[11px] text-muted-foreground">/mo</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate text-[11px] text-muted-foreground">{termLabel}</p>
          {remainingLabel && (
            <p className="text-[11px] font-medium" style={{ color }}>{remainingLabel}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

interface LeaseListTabsProps {
  readonly leases: SerializedLease[]
}

export function LeaseListTabs({ leases }: LeaseListTabsProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"list" | "cards">("list")

  // My portfolio / All (ADDENDUM_TEAMS Layer 0) — "mine" = leases on properties I manage (via the
  // portfolio resolver). Default My portfolio; everything below works off the scoped list.
  const portfolio = useMyPortfolio()
  const showScope = useShowScopeFilter()  // My portfolio / All only from Portfolio up
  const [scope, setScope] = useState<"mine" | "all">("mine")
  const effScope = showScope ? scope : "all"
  const scopedLeases = effScope === "mine" && portfolio.ready
    ? leases.filter((l) => portfolio.leaseIds.has(l.id))
    : leases
  const nothingInPortfolio = effScope === "mine" && scopedLeases.length === 0

  // Status counts — computed from the scoped leases (drives the count line + draft hint)
  const counts = useMemo(() => ({
    active:   scopedLeases.filter((l) => ["active", "month_to_month"].includes(l.status)).length,
    notice:   scopedLeases.filter((l) => l.status === "notice").length,
    expiring: scopedLeases.filter((l) => ["active", "month_to_month"].includes(l.status) && isExpiringSoon(l)).length,
    draft:    scopedLeases.filter((l) => ["draft", "pending_signing"].includes(l.status)).length,
    all:      scopedLeases.length,
  }), [scopedLeases])

  const byStatus = useMemo(() => filterByStatus(scopedLeases, statusFilter), [scopedLeases, statusFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter((l) => leaseSearchHaystack(l).includes(q))
  }, [byStatus, search])

  const { sortKey, sortDir, onSort } = useListSort<LeaseSortKey>("property")
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === "property") cmp = (a.units?.properties.name ?? "").localeCompare(b.units?.properties.name ?? "")
      else if (sortKey === "tenant") cmp = leaseTenantName(a).localeCompare(leaseTenantName(b))
      else if (sortKey === "rent") cmp = a.rent_amount_cents - b.rent_amount_cents
      else if (sortKey === "term") cmp = (a.end_date ?? "").localeCompare(b.end_date ?? "")
      else cmp = a.status.localeCompare(b.status)
      return sortDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const hasDraftHint = statusFilter === "active" && !search && counts.draft > 0
  const draftWord = counts.draft === 1 ? "lease" : "leases"
  let emptyDescription: string
  let emptyAction: { label: string; onClick: () => void } | undefined
  if (nothingInPortfolio) {
    emptyDescription = "There are leases in your organisation — just none in your portfolio."
    emptyAction = { label: "View all", onClick: () => setScope("all") }
  } else if (hasDraftHint) {
    emptyDescription = `You have ${counts.draft} draft ${draftWord}`
    emptyAction = { label: "View drafts", onClick: () => setStatusFilter("draft") }
  } else {
    emptyDescription = "No leases match this filter."
    emptyAction = undefined
  }

  // KPI strip — portfolio-wide (stable, not filter-dependent) so the rent roll matches the properties list.
  const footerMetrics = useMemo(() => {
    const inForce = scopedLeases.filter((l) => isInForceLease(l.status))
    const totalRent = inForce.reduce((s, l) => s + l.rent_amount_cents, 0)
    const avgRent = inForce.length > 0 ? Math.round(totalRent / inForce.length) : 0
    const expiringSoon = scopedLeases.filter((l) => ["active", "month_to_month"].includes(l.status) && isExpiringSoon(l)).length
    const cpaNoticesDue = scopedLeases.filter((l) =>
      l.cpa_applies && l.is_fixed_term && !l.auto_renewal_notice_sent_at && isExpiringSoon(l)
    ).length
    return { totalRent, avgRent, activeCount: inForce.length, totalCount: scopedLeases.length, expiringSoon, cpaNoticesDue }
  }, [scopedLeases])

  const countWord = filtered.length === 1 ? "lease" : "leases"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Summary KPI strip (matches the properties list) */}
      <LeaseListFooter {...footerMetrics} />

      {/* Shared toolbar: list/grid · status filter · search */}
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by tenant, property or unit…"
        view={view}
        onView={setView}
        rightFilters={showScope ? (
          <ToolbarFilter
            label="View"
            selected={[scope]}
            onChange={(next) => setScope((next[0] as "mine" | "all") ?? "mine")}
            options={[{ value: "mine", label: "My portfolio" }, { value: "all", label: "All" }]}
          />
        ) : undefined}
        filters={
          <ToolbarFilter
            label="Status"
            selected={[statusFilter]}
            onChange={(next) => setStatusFilter((next[0] as StatusFilter) ?? "active")}
            options={STATUS_OPTIONS}
          />
        }
      />

      <p className="text-xs text-muted-foreground">
        {filtered.length} {countWord}
        {statusFilter === "all" ? "" : ` · ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label.toLowerCase()}`}
        {search ? ` matching “${search}”` : ""}
      </p>

      {/* Lease rows / cards */}
      {filtered.length === 0 && nothingInPortfolio && (
        <EmptyResourceState
          emptyTitle="Nothing in your portfolio"
          emptySub="There are leases in your organisation — just none in your portfolio."
          icon={<FileText className="h-6 w-6" />}
          heroAction={<AddButton label="View all" showPlus={false} onClick={() => setScope("all")} />}
        />
      )}

      {filtered.length === 0 && !nothingInPortfolio && (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="No leases"
          description={emptyDescription}
          action={emptyAction}
        />
      )}

      {filtered.length > 0 && view === "list" && (
        <ListCard fill>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-border/60 bg-card">
              <tr>
                <th className="px-3 py-2.5 text-left"><SortHeader col="property" label="Property / Unit" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left"><SortHeader col="tenant" label="Tenants" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left"><SortHeader col="rent" label="Rent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left"><SortHeader col="term" label="Term" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left"><SortHeader col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sorted.map((lease) => (
                <LeaseRow key={lease.id} lease={lease} />
              ))}
            </tbody>
          </table>
        </ListCard>
      )}

      {filtered.length > 0 && view === "cards" && (
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lease) => (
            <LeaseCard key={lease.id} lease={lease} />
          ))}
        </div>
      )}
    </div>
  )
}
