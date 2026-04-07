"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useOrg } from "@/hooks/useOrg"
import { createClient } from "@/lib/supabase/client"
import {
  PORTFOLIO_QUERY_KEYS, STALE_TIME,
  fetchTenants, fetchLandlords, fetchContractors, fetchLeases,
} from "@/lib/queries/portfolio"

export function PortfolioPrefetcher() {
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    Promise.allSettled([
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId), queryFn: () => fetchTenants(supabase, orgId), staleTime: STALE_TIME.tenants }),
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId), queryFn: () => fetchLandlords(supabase, orgId), staleTime: STALE_TIME.landlords }),
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId), queryFn: () => fetchContractors(supabase, orgId), staleTime: STALE_TIME.contractors }),
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId), queryFn: () => fetchLeases(supabase, orgId), staleTime: STALE_TIME.leases }),
    ])
  }, [orgId, queryClient])

  return null
}
