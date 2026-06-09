"use client"

/**
 * hooks/useShowScopeFilter.ts — whether the "View" filter (My work / All / team) applies for the tier
 *
 * Notes:  Per-agent + team scoping only earns its place once an agency is large enough to need it. The
 *         filter appears from Portfolio up — Owner / Steward / Growth always see everything, so below
 *         Portfolio callers treat scope as "all". Same threshold across the work queues + portfolio lists.
 */
import { useTier } from "@/hooks/useTier"
import { TIER_ORDER } from "@/lib/constants"

export function useShowScopeFilter(): boolean {
  const { tier } = useTier()
  return TIER_ORDER[tier] >= TIER_ORDER.portfolio
}
