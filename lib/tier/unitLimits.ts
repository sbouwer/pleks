/**
 * lib/tier/unitLimits.ts — Check whether an org can add another active unit against their tier cap
 *
 * Auth:   Server-only; called from server actions and API routes
 * Data:   Supabase RPC get_active_unit_count; TIER_LIMITS from constants
 * Notes:  No overage grace band — activation is blocked at the exact cap.
 *         Caller shows an upgrade prompt when allowed = false.
 */
import { TIER_LIMITS, type Tier } from "@/lib/constants"
import { type SupabaseClient } from "@supabase/supabase-js"

export async function checkUnitLimit(
  supabase: SupabaseClient,
  orgId: string,
  tier: Tier
): Promise<{ allowed: boolean; current: number; limit: number | null }> {
  const limit = TIER_LIMITS[tier].leases

  const { data } = await supabase.rpc("get_active_unit_count", { p_org_id: orgId })
  const current = (data as number) ?? 0

  if (limit === null) {
    return { allowed: true, current, limit: null }
  }

  return { allowed: current < limit, current, limit }
}
