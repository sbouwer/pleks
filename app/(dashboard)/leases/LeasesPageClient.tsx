"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { LeaseListTabs } from "./LeaseListTabs"
import type { SerializedLease } from "./LeaseRow"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchLeases } from "@/lib/queries/portfolio"

interface Props { orgId: string }

export function LeasesPageClient({ orgId }: Props) {
  const supabase = createClient()
  const { data: rawLeases = [] } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchLeases(supabase as any, orgId),
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
          <p className="text-sm text-muted-foreground">
            Manage tenancy agreements and rental schedules.
          </p>
        </div>
        <Button render={<Link href="/leases/new" />}>
          <Plus className="mr-1 h-4 w-4" /> Create Lease
        </Button>
      </div>

      <LeaseListTabs leases={serialised} />
    </div>
  )
}
