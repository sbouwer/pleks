"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { TenantsClient } from "./TenantsClient"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchTenantsAction } from "@/lib/queries/portfolioActions"

interface Props { orgId: string; role: string }

export function TenantsPageClient({ orgId, role }: Props) {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId),
    queryFn: () => fetchTenantsAction(orgId),
    staleTime: STALE_TIME.tenants,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Tenants</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} tenants</p>
        </div>
        <Button render={<Link href="/tenants/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Add Tenant
        </Button>
      </div>
      {!isLoading && tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No tenants yet. Import contacts or add one using the button above.
        </p>
      ) : isLoading ? null : (
        <TenantsClient tenants={tenants} userRole={role} />
      )}
    </div>
  )
}
