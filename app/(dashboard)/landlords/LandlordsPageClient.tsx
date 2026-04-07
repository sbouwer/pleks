"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { LandlordsClient } from "./LandlordsClient"
import { AddLandlordForm } from "./AddLandlordForm"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchLandlords } from "@/lib/queries/portfolio"

interface Props { orgId: string; role: string }

export function LandlordsPageClient({ orgId, role }: Props) {
  const supabase = createClient()
  const { data: landlords = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchLandlords(supabase as any, orgId),
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
