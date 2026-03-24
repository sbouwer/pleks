import { TIER_LIMITS, OVERAGE_RATE_CENTS, type Tier } from "@/lib/constants"
import { type SupabaseClient } from "@supabase/supabase-js"

const OVERAGE_GRACE_BAND = 5

export async function checkUnitLimit(
  supabase: SupabaseClient,
  orgId: string,
  tier: Tier
): Promise<{ allowed: boolean; current: number; limit: number | null; overage: boolean }> {
  const limit = TIER_LIMITS[tier].units

  const { data } = await supabase.rpc("get_active_unit_count", { p_org_id: orgId })
  const current = (data as number) ?? 0

  if (limit === null) {
    return { allowed: true, current, limit: null, overage: false }
  }

  const hardLimit = limit + OVERAGE_GRACE_BAND

  return {
    allowed: current < hardLimit,
    current,
    limit,
    overage: current >= limit,
  }
}
