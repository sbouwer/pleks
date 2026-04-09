"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { EmptyState } from "@/components/shared/EmptyState"
import { UserSquare2 } from "lucide-react"
import { LandlordsClient } from "./LandlordsClient"
import { AddLandlordForm } from "./AddLandlordForm"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchLandlordsAction } from "@/lib/queries/portfolioActions"

interface Props { readonly orgId: string; readonly role: string }

export function LandlordsPageClient({ orgId, role }: Props) {
  const { data: landlords = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId),
    queryFn: () => fetchLandlordsAction(orgId),
    staleTime: STALE_TIME.landlords,
  })

  let body: React.ReactNode = null
  if (!isLoading) {
    if (landlords.length === 0) {
      body = (
        <EmptyState
          icon={<UserSquare2 className="h-8 w-8 text-muted-foreground" />}
          title="No landlords yet"
          description="Import contacts from a CSV or add landlords manually using the button above."
        />
      )
    } else {
      body = <LandlordsClient landlords={landlords} userRole={role} />
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Landlords</h1>
          <p className="text-sm text-muted-foreground">{landlords.length} landlords</p>
        </div>
        <AddLandlordForm orgId={orgId} />
      </div>
      {body}
    </div>
  )
}
