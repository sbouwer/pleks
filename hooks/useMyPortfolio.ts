"use client"

/**
 * hooks/useMyPortfolio.ts — client access to the agent's "my portfolio" id-sets (ADDENDUM_TEAMS Layer 0)
 *
 * Auth:   getMyPortfolio() server action (gateway); cached per session under ["my-portfolio"].
 * Data:   property / landlord / lease / tenant ids the current agent manages (via managing_agent_id).
 * Notes:  Returns Sets for O(1) `row.id` membership checks in the relationship lists (properties, leases,
 *         tenants, landlords). Work-item queues use the flat isMine predicate instead.
 */
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { getMyPortfolio } from "@/lib/work/myPortfolio"

export function useMyPortfolio() {
  const { data } = useQuery({
    queryKey: ["my-portfolio"],
    queryFn: getMyPortfolio,
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => ({
    propertyIds: new Set(data?.propertyIds ?? []),
    landlordIds: new Set(data?.landlordIds ?? []),
    leaseIds: new Set(data?.leaseIds ?? []),
    tenantIds: new Set(data?.tenantIds ?? []),
    ready: !!data,
  }), [data])
}
