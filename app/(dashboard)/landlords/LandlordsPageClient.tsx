"use client"

import { useQuery } from "@tanstack/react-query"
import { LandlordsClient } from "./LandlordsClient"
import { AddLandlordForm } from "./AddLandlordForm"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchLandlordsAction } from "@/lib/queries/portfolioActions"

interface Props { orgId: string; role: string }

export function LandlordsPageClient({ orgId, role }: Props) {
  const { data: landlords = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId),
    queryFn: () => fetchLandlordsAction(orgId),
    staleTime: STALE_TIME.landlords,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Landlords</h1>
          <p className="text-sm text-muted-foreground">{landlords.length} landlords</p>
        </div>
        <AddLandlordForm orgId={orgId} />
      </div>
      {!isLoading && landlords.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No landlords yet. Import contacts or add one using the button above.
        </p>
      ) : isLoading ? null : (
        <LandlordsClient landlords={landlords} userRole={role} />
      )}
    </div>
  )
}
