"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "./useOrg"
import { type Tier } from "@/lib/constants"
import { hasFeature } from "@/lib/tier/gates"

export function useTier() {
  const { orgId } = useOrg()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end")
        .eq("org_id", orgId!)
        .eq("status", "active")
        .limit(1)
        .single()
      return data
    },
    enabled: !!orgId,
  })

  const tier = (data?.tier as Tier) ?? "owner"

  return {
    tier,
    loading: isLoading,
    isOwner: tier === "owner",
    isSteward: tier === "steward",
    isPortfolio: tier === "portfolio",
    isFirm: tier === "firm",
    can: (feature: string) => hasFeature(tier, feature),
    status: data?.status ?? "active",
    periodEnd: data?.current_period_end ?? null,
  }
}
