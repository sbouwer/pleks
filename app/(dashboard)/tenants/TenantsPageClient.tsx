"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Users, Plus } from "lucide-react"
import { TenantsClient } from "./TenantsClient"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchTenantsAction } from "@/lib/queries/portfolioActions"

interface Props { orgId: string }

export function TenantsPageClient({ orgId }: Props) {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId),
    queryFn: () => fetchTenantsAction(orgId),
    staleTime: STALE_TIME.tenants,
  })

  let body: React.ReactNode = null
  if (!isLoading) {
    if (tenants.length === 0) {
      body = (
        <EmptyState
          icon={<Users className="h-8 w-8 text-muted-foreground" />}
          title="No tenants yet"
          description="Import contacts from a CSV or add tenants manually using the button above."
        />
      )
    } else {
      body = <TenantsClient tenants={tenants} />
    }
  }

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
      {body}
    </div>
  )
}
