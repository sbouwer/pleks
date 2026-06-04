"use client"

/**
 * app/(dashboard)/leases/LeaseListTabs.tsx — Lease list with shared ListToolbar (status filter + search) and footer metrics
 *
 * Route:  /leases
 * Auth:   gateway (dashboard layout)
 * Data:   SerializedLease array from LeasesPageClient
 * Notes:  Status filter values mirror the lease status groupings used across the list
 *         (active/month_to_month, notice, expiring-soon, draft/pending_signing, all).
 *         Search matches tenant/co-tenant names, property name and unit number.
 */
import { useState, useMemo } from "react"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"
import { ListToolbar, ToolbarFilter } from "@/components/ui/resource-list"
import { LeaseRow, type SerializedLease } from "./LeaseRow"
import { LeaseListFooter } from "./LeaseListFooter"
import { isExpiringSoon } from "@/lib/leases/expiringLogic"

type StatusFilter = "active" | "notice" | "expiring" | "draft" | "all"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active",   label: "Active" },
  { value: "notice",   label: "Notice" },
  { value: "expiring", label: "Expiring soon" },
  { value: "draft",    label: "Draft" },
  { value: "all",      label: "All" },
]

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

interface LeaseListTabsProps {
  readonly leases: SerializedLease[]
}

export function LeaseListTabs({ leases }: LeaseListTabsProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [search, setSearch] = useState("")

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
    <div className="flex flex-1 flex-col min-h-0">
      {/* Shared toolbar: status filter + search (no cards view for leases) */}
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by tenant, property or unit…"
        filters={
          <ToolbarFilter
            label="Status"
            selected={[statusFilter]}
            onChange={(next) => setStatusFilter((next[0] as StatusFilter) ?? "active")}
            options={STATUS_OPTIONS}
          />
        }
      />

      <p className="mb-4 mt-3 text-xs text-muted-foreground">
        {filtered.length} {countWord}
        {statusFilter === "all" ? "" : ` · ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label.toLowerCase()}`}
        {search ? ` matching “${search}”` : ""}
      </p>

      {/* Column headers */}
      {filtered.length > 0 && (
        <div className="mb-2 grid grid-cols-[2fr_3fr_1fr_1.5fr_auto] gap-4 px-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property / Unit</p>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tenants</p>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rent</p>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Term</p>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
        </div>
      )}

      {/* Lease rows */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="No leases"
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((lease) => (
            <LeaseRow key={lease.id} lease={lease} />
          ))}
        </div>
      )}

      {/* Spacer pushes footer to bottom */}
      <div className="flex-1" />

      {/* Footer */}
      <LeaseListFooter {...footerMetrics} />
    </div>
  )
}
