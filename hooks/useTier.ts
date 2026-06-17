"use client"

/**
 * hooks/useTier.ts — Client hook returning the active subscription tier and trial state
 *
 * Data:   subscriptions table via anon Supabase client (active + trialing rows only)
 * Notes:  For full subscription state (paused, cancelled, pending) use useFullSubState
 *         in the subscription settings page — this hook is optimised for the common case.
 */
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "./useOrg"
import { type Tier } from "@/lib/constants"
import { hasFeature } from "@/lib/tier/gates"
import { getEffectiveTier } from "@/lib/tier/effectiveTier"
import { computeTrialDaysLeft } from "@/lib/trial/utils"
import { logQueryError } from "@/lib/supabase/logQueryError"

export function useTier() {
  const { orgId } = useOrg()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end, trial_tier, trial_ends_at, trial_converted")
        .eq("org_id", orgId)
        .in("status", ["active", "trialing"])
        .limit(1)
        .maybeSingle()   // an org with no active/trialing sub is a normal state — not an error to log
        logQueryError("{ data, isLoading } subscriptions", queryError)
      return data
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  // The tier is only KNOWN once the query has actually resolved for a real org. While orgId is still
  // resolving the query is disabled (isLoading === false) yet data is undefined — without this guard the
  // default "owner" tier leaks through and flashes the upgrade box for a paid org. `data === null` is a
  // real resolved state (an org with no active subscription = genuine owner), so only `undefined` is unknown.
  const tierResolved = !!orgId && data !== undefined
  const loading = isLoading || !tierResolved
  const tier: Tier = data ? getEffectiveTier(data) : "owner"
  const isTrialing = data?.status === "trialing" && !data?.trial_converted
  const trialEndsAt = isTrialing ? data?.trial_ends_at : null
  // Calculate days remaining from trial end date
  // Computed as a derived value — trialEndsAt is stable from the query
  const trialDaysLeft = computeTrialDaysLeft(trialEndsAt)

  return {
    tier,
    loading,
    isOwner: tier === "owner",
    isSteward: tier === "steward",
    isGrowth: tier === "growth",
    isPortfolio: tier === "portfolio",
    isFirm: tier === "firm",
    /** any paid tier (steward and up) — the common "not the free owner tier" gate */
    isPaid: tier !== "owner",
    can: (feature: string) => hasFeature(tier, feature),
    status: data?.status ?? "active",
    periodEnd: data?.current_period_end ?? null,
    isTrialing,
    trialEndsAt,
    trialDaysLeft,
    trialTier: data?.trial_tier ?? null,
  }
}
