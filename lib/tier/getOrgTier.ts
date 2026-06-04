/**
 * lib/tier/getOrgTier.ts — Org tier resolvers: canonical DB (gates) and cookie fast-path (display)
 *
 * Auth:   Server-only; service client for canonical path, cookie-backed client for fast-path
 * Data:   subscriptions table (canonical); pleks_org cookie (fast-path display only)
 * Notes:  getOrgTierCanonical is the ONLY resolver for entitlement gates — cookie tier is forgeable.
 *         getOrgTier (fast-path) is for display surfaces only (badges, plan labels, feature hints).
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Tier } from "@/lib/constants"
import { getEffectiveTier } from "./effectiveTier"
import { getServerOrgMembership } from "@/lib/auth/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** Canonical tier — always reads subscriptions via service client.
 *  Use for ALL entitlement gates (canActivateLease, canDowngradeTo, etc.).
 *  The cookie fast-path (getOrgTier) is display-only and forgeable. */
export async function getOrgTierCanonical(orgId: string): Promise<Tier> {
  const db = await createServiceClient()
  const { data: sub, error: subError } = await db
    .from("subscriptions")
    .select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .maybeSingle()
    logQueryError("getOrgTierCanonical subscriptions", subError)
  if (!sub) return "owner"
  return getEffectiveTier(sub)
}

/** Display-only tier — reads pleks_org cookie with DB fallback on cache miss.
 *  Forgeable: a user can set tier:"bespoke" in the cookie to mislead display.
 *  Use ONLY for display surfaces (badges, plan labels, feature-visibility hints).
 *  Never use for capability gates — use getOrgTierCanonical instead. */
export async function getOrgTier(orgId: string): Promise<Tier> {
  const membership = await getServerOrgMembership()
  if (membership?.org_id === orgId && membership.tier) {
    return membership.tier as Tier
  }

  const supabase = await createClient()
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .single()
    logQueryError("getOrgTier subscriptions", subError)

  if (!sub) return "owner"

  return getEffectiveTier(sub)
}
