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
import { FileText } from "lucide-react"
import { ListToolbar, ToolbarFilter, ListCard } from "@/components/ui/resource-list"
import { LeaseRow, type SerializedLease } from "./LeaseRow"
import { LeaseListFooter } from "./LeaseListFooter"
import { isExpiringSoon, getExpiryUrgency, getExpiryColor } from "@/lib/leases/expiringLogic"
import { buildTenantDisplay } from "@/lib/leases/tenantDisplay"
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
  active:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  month_to_month:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  notice:          "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  draft:           "bg-muted text-muted-foreground",
  pending_signing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  expired:         "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled:       "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
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

function isInCurrentQuarter(dateStr: string | null): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    Math.floor(date.getMonth() / 3) === Math.floor(now.getMonth() / 3)
  )
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"list" | "cards">("list")

  // Status counts — computed from all leases (drives the count line + draft hint)
  const counts = useMemo(() => ({
    active:   leases.filter((l) => ["active", "month_to_month"].includes(l.status)).length,
    notice:   leases.filter((l) => l.status === "notice").length,
    expiring: leases.filter((l) => ["active", "month_to_month"].includes(l.status) && isExpiringSoon(l)).length,
    draft:    leases.filter((l) => ["draft", "pending_signing"].includes(l.status)).length,
    all:      leases.length,
  }), [leases])

  const byStatus = useMemo(() => filterByStatus(leases, statusFilter), [leases, statusFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter((l) => leaseSearchHaystack(l).includes(q))
  }, [byStatus, search])

  const hasDraftHint = statusFilter === "active" && !search && counts.draft > 0
  const draftWord = counts.draft === 1 ? "lease" : "leases"
  const emptyDescription = hasDraftHint
    ? `You have ${counts.draft} draft ${draftWord}`
    : "No leases match this filter."
  const emptyAction = hasDraftHint
    ? { label: "View drafts", onClick: () => setStatusFilter("draft") }
    : undefined

  // Footer metrics — based on filtered set
  const footerMetrics = useMemo(() => {
    const active = filtered.filter((l) => ["active", "month_to_month", "notice"].includes(l.status))
    const totalRent = active.reduce((s, l) => s + l.rent_amount_cents, 0)
    const avgRent = active.length > 0 ? Math.round(totalRent / active.length) : 0
    const escalationsDue = filtered.filter((l) => isInCurrentQuarter(l.escalation_review_date)).length
    const cpaNoticesDue = filtered.filter((l) =>
      l.cpa_applies && l.is_fixed_term && !l.auto_renewal_notice_sent_at && isExpiringSoon(l)
    ).length
    return { totalRent, avgRent, escalationsDue, cpaNoticesDue }
  }, [filtered])

  const countWord = filtered.length === 1 ? "lease" : "leases"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Shared toolbar: list/grid · status filter · search */}
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by tenant, property or unit…"
        view={view}
        onView={setView}
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
      {filtered.length === 0 && (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="No leases"
          description={emptyDescription}
          action={emptyAction}
        />
      )}

      {filtered.length > 0 && view === "list" && (
        <ListCard fill>
          {/* Sticky column headers */}
          <div className="sticky top-0 z-10 grid grid-cols-[2fr_3fr_1fr_1.5fr_auto] gap-4 bg-card px-4 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property / Unit</p>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tenants</p>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rent</p>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Term</p>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
          </div>
          <div className="space-y-1.5 px-2 pb-2">
            {filtered.map((lease) => (
              <LeaseRow key={lease.id} lease={lease} />
            ))}
          </div>
        </ListCard>
      )}

      {filtered.length > 0 && view === "cards" && (
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lease) => (
            <LeaseCard key={lease.id} lease={lease} />
          ))}
        </div>
      )}

      {/* Footer metrics — auto-height row below the scroll area */}
      <div className="shrink-0">
        <LeaseListFooter {...footerMetrics} />
      </div>
    </div>
  )
}
