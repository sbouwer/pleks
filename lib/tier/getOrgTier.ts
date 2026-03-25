import { createClient } from "@/lib/supabase/server"
import type { Tier } from "@/lib/constants"
import { getEffectiveTier } from "./effectiveTier"

// Server-only helper — do NOT import in client components
export async function getOrgTier(orgId: string): Promise<Tier> {
  const supabase = await createClient()
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .single()

  if (!sub) return "owner"

  return getEffectiveTier(sub)
}
