"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
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
  const { data: rawLeases = [] } = useQuery({
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
      debicheck_mandate_status: l.debicheck_mandate_status ?? null,
      escalation_review_date: l.escalation_review_date ?? null,
      tenant_id: l.tenant_id,
      tenant_view: tv,
      units: unit,
      lease_co_tenants: coTenants,
    }
  })

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Leases</h1>
          <p className="text-sm text-muted-foreground hidden lg:block">
            Manage tenancy agreements and rental schedules.
          </p>
          <p className="text-xs text-muted-foreground lg:hidden">
            {serialised.length} lease{serialised.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button size="sm" render={<Link href="/leases/new" />}>
          <Plus className="mr-1 h-4 w-4" /> Create Lease
        </Button>
      </div>

      {/* Mobile lease cards */}
      <div className="lg:hidden space-y-2">
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
      <div className="hidden lg:block">
        <LeaseListTabs leases={serialised} />
      </div>
    </div>
  )
}
