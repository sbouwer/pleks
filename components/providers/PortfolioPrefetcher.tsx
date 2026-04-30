"use client"

/**
 * components/providers/PortfolioPrefetcher.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useOrg } from "@/hooks/useOrg"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import {
  fetchTenantsAction, fetchLandlordsAction,
  fetchContractorsAction, fetchLeasesAction,
} from "@/lib/queries/portfolioActions"

export function PortfolioPrefetcher() {
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!orgId) return
    Promise.allSettled([
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId), queryFn: () => fetchTenantsAction(orgId), staleTime: STALE_TIME.tenants }),
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId), queryFn: () => fetchLandlordsAction(orgId), staleTime: STALE_TIME.landlords }),
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId), queryFn: () => fetchContractorsAction(orgId), staleTime: STALE_TIME.contractors }),
      queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId), queryFn: () => fetchLeasesAction(orgId), staleTime: STALE_TIME.leases }),
    ])
  }, [orgId, queryClient])

  return null
}
