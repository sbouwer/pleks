"use client"

/**
 * app/(dashboard)/leases/LeasesPageClient.tsx — Client shell for the /leases page: data fetch + mobile/desktop split
 *
 * Route:  /leases
 * Auth:   gateway (dashboard layout)
 * Data:   fetchLeasesAction via react-query; stale time from STALE_TIME.leases
 */

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { FileText } from "lucide-react"
import { LeaseListTabs } from "./LeaseListTabs"
import type { SerializedLease } from "./LeaseRow"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchLeasesAction } from "@/lib/queries/portfolioActions"
import { formatZAR } from "@/lib/constants"

const LEASE_STATUS_STYLES: Record<string, string> = {
  active:          "bg-emerald-100 text-emerald-700",
  month_to_month:  "bg-emerald-100 text-emerald-700",
  notice:          "bg-purple-100 text-purple-700",
  draft:           "bg-muted text-muted-foreground",
  pending_signing: "bg-amber-100 text-amber-700",
  expired:         "bg-red-100 text-red-700",
  cancelled:       "bg-red-100 text-red-700",
}
const LEASE_STATUS_LABELS: Record<string, string> = {
  active: "Active", month_to_month: "MTM", notice: "Notice",
  draft: "Draft", pending_signing: "Pending", expired: "Expired", cancelled: "Cancelled",
}

interface Props { orgId: string }

export function LeasesPageClient({ orgId }: Props) {
  const router = useRouter()
  const { data: rawLeases = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId),
    queryFn: () => fetchLeasesAction(orgId),
    staleTime: STALE_TIME.leases,
  })

  const serialised: SerializedLease[] = rawLeases.map((l) => {
    const tv = l.tenant_view as unknown as {
      id: string; first_name: string | null; last_name: string | null
      company_name: string | null; entity_type: string
    } | null

    const unit = l.units as unknown as {
      unit_number: string
      properties: { name: string; suburb: string | null; city: string | null }
    } | null

    const coTenants = (l.lease_co_tenants as unknown as Array<{
      tenant_id: string
      tenants: {
        id: string
        contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null
      } | null
    }>) ?? []

    return {
      id: l.id,
      status: l.status,
      lease_type: l.lease_type,
      start_date: l.start_date ?? null,
      end_date: l.end_date ?? null,
      rent_amount_cents: l.rent_amount_cents ?? 0,
      notice_period_days: l.notice_period_days ?? 20,
      is_fixed_term: l.is_fixed_term ?? false,
      cpa_applies: l.cpa_applies ?? false,
      auto_renewal_notice_sent_at: l.auto_renewal_notice_sent_at ?? null,
      escalation_review_date: l.escalation_review_date ?? null,
      tenant_id: l.tenant_id,
      tenant_view: tv,
      units: unit,
      lease_co_tenants: coTenants,
    }
  })

  // Empty → the shared empty state (no tabs/filters or footer metrics — nothing to filter or total).
  if (!isLoading && serialised.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Portfolio"
        title="Leases"
        headline="No leases yet"
        headerSub="Create a lease to manage tenancy agreements and rental schedules."
        emptyTitle="No leases here yet"
        emptySub="Create your first lease once a tenant is ready to be placed on a unit."
        icon={<FileText className="h-6 w-6" />}
        headerAction={<AddButton label="Create lease" onClick={() => router.push("/leases/new")} />}
        heroAction={<AddButton label="Create your first lease" variant="hero" showPlus={false} onClick={() => router.push("/leases/new")} />}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        title="Leases"
        headline="Your leases"
        sub={
          <>
            <span className="hidden lg:inline">Manage tenancy agreements and rental schedules.</span>
            <span className="lg:hidden">{serialised.length} lease{serialised.length === 1 ? "" : "s"}</span>
          </>
        }
        action={<AddButton label="Create lease" onClick={() => router.push("/leases/new")} />}
      />

      {/* Mobile lease cards */}
      <div className="lg:hidden min-h-0 flex-1 space-y-2 overflow-auto">
        {serialised.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No leases yet.</p>
        ) : (
          serialised.map((lease) => {
            const tv = lease.tenant_view
            const tenantName = tv
              ? (tv.company_name || `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim() || "Unnamed")
              : "No tenant"
            const unit = lease.units
            const unitLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : ""
            return (
              <Link key={lease.id} href={`/leases/${lease.id}`} className="block border border-border rounded-xl px-4 py-3 hover:border-brand/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{tenantName}</p>
                    {unitLabel && <p className="text-xs text-muted-foreground mt-0.5">{unitLabel}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatZAR(lease.rent_amount_cents)}/mo
                      {lease.end_date ? ` · ends ${new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" })}` : ""}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${LEASE_STATUS_STYLES[lease.status] ?? LEASE_STATUS_STYLES.draft}`}>
                    {LEASE_STATUS_LABELS[lease.status] ?? lease.status}
                  </span>
                </div>
              </Link>
            )
          })
        )}
      </div>

      {/* Desktop tabs */}
      <div className="hidden min-h-0 flex-1 lg:flex lg:flex-col">
        <LeaseListTabs leases={serialised} />
      </div>
    </div>
  )
}
