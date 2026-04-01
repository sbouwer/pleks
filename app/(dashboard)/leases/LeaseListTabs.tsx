"use client"

import { useState, useMemo } from "react"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"
import { LeaseRow, type SerializedLease } from "./LeaseRow"
import { LeaseListFooter } from "./LeaseListFooter"
import { isExpiringSoon } from "@/lib/leases/expiringLogic"

type TabId = "active" | "notice" | "expiring" | "draft" | "all"

const TABS: { id: TabId; label: string }[] = [
  { id: "active",   label: "Active" },
  { id: "notice",   label: "Notice" },
  { id: "expiring", label: "Expiring soon" },
  { id: "draft",    label: "Draft" },
  { id: "all",      label: "All" },
]

function filterLeases(leases: SerializedLease[], tab: TabId): SerializedLease[] {
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

interface LeaseListTabsProps {
  readonly leases: SerializedLease[]
}

export function LeaseListTabs({ leases }: LeaseListTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("active")

  // Tab counts — computed from all leases
  const counts = useMemo(() => ({
    active:   leases.filter((l) => ["active", "month_to_month"].includes(l.status)).length,
    notice:   leases.filter((l) => l.status === "notice").length,
    expiring: leases.filter((l) => ["active", "month_to_month"].includes(l.status) && isExpiringSoon(l)).length,
    draft:    leases.filter((l) => ["draft", "pending_signing"].includes(l.status)).length,
    all:      leases.length,
  }), [leases])

  const filtered = useMemo(() => filterLeases(leases, activeTab), [leases, activeTab])

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

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                activeTab === tab.id
                  ? "bg-brand/15 text-brand"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Column headers */}
      {filtered.length > 0 && (
        <div className="mb-2 grid grid-cols-[2fr_2fr_1fr_2fr_auto] gap-4 px-4">
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
          description="No leases match this filter."
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
