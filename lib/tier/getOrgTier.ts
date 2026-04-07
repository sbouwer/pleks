import { createClient } from "@/lib/supabase/server"
import type { Tier } from "@/lib/constants"
import { getEffectiveTier } from "./effectiveTier"
import { getServerOrgMembership } from "@/lib/auth/server"

// Server-only helper — do NOT import in client components
export async function getOrgTier(orgId: string): Promise<Tier> {
  // Fast path: tier is already in the pleks_org cookie (set by proxy.ts)
  const membership = await getServerOrgMembership()
  if (membership?.org_id === orgId && membership.tier) {
    return membership.tier as Tier
  }

  // Fallback: DB query (cookie miss or first request before proxy sets tier)
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
