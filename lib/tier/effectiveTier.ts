import type { Tier } from "@/lib/constants"

// Shared between server (getOrgTier.ts) and client (useTier.ts)
// Client-safe — no server imports
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
