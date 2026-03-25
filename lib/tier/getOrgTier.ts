import { createClient } from "@/lib/supabase/server"
import type { Tier } from "@/lib/constants"

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

export function getEffectiveTier(subscription: {
  tier: string
  status: string
  trial_tier?: string | null
  trial_ends_at?: string | null
  trial_converted?: boolean | null
}): Tier {
  if (
    subscription.status === "trialing" &&
    subscription.trial_ends_at &&
    new Date(subscription.trial_ends_at) > new Date() &&
    subscription.trial_tier &&
    !subscription.trial_converted
  ) {
    return subscription.trial_tier as Tier
  }
  return (subscription.tier as Tier) ?? "owner"
}
