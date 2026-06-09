"use client"

/**
 * hooks/useShowScopeFilter.ts — whether the work-queue "View" filter (My work / All / team) applies
 *
 * Notes:  Per-agent + team scoping only earns its place once an agency is large enough to have a real team.
 *         Owner (1 lease) and Steward (≤15) always see everything, so the filter falls away there — it
 *         appears from Growth up. Below Growth, callers should treat scope as "all".
 */
import { useTier } from "@/hooks/useTier"
import { TIER_ORDER } from "@/lib/constants"

export function useShowScopeFilter(): boolean {
  const { tier } = useTier()
  return TIER_ORDER[tier] >= TIER_ORDER.growth
}
