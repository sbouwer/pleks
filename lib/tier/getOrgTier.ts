/**
 * lib/tier/getOrgTier.ts — Org tier resolvers: canonical DB (gates) and cookie fast-path (display)
 *
 * Auth:   Server-only; service client for canonical path, cookie-backed client for fast-path
 * Data:   subscriptions table (canonical); pleks_org cookie (fast-path display only)
 * Notes:  getOrgTierCanonical is the ONLY resolver for entitlement gates — cookie tier is forgeable.
 *         getOrgTierAny is the SAME read, typed as AnyTier for the product-line-aware route guard
 *         (an HOA org's subscriptions.tier genuinely holds an hoa_* literal). Both go through one
 *         _readEffectiveTier() so the two views can never drift (ADDENDUM_18C).
 *         getOrgTier (fast-path) is for display surfaces only (badges, plan labels, feature hints).
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Tier, AnyTier } from "@/lib/constants"
import { getEffectiveTier } from "./effectiveTier"
import { getServerOrgMembership } from "@/lib/auth/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** The single canonical read of an org's effective tier from subscriptions (service client). Returns the
 *  raw tier STRING — the column holds a residential (owner…bespoke) OR an HOA (hoa_*) literal. The two
 *  public views below narrow it to the type each caller needs, so there is ONE read, no drift. */
async function _readEffectiveTier(orgId: string): Promise<string> {
  const db = await createServiceClient()
  const { data: sub, error: subError } = await db
    .from("subscriptions")
    .select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .maybeSingle()
    logQueryError("getOrgTier(canonical) subscriptions", subError)
  if (!sub) return "owner"
  return getEffectiveTier(sub)
}

/** Canonical tier for ALL entitlement/lease gates (canActivateLease, canDowngradeTo, etc.). Return type
 *  stays Tier — its residential assumption is intact and these money-adjacent gates are untouched by the
 *  HOA line (an HOA org never reaches them). The cookie fast-path (getOrgTier) is display-only/forgeable. */
export async function getOrgTierCanonical(orgId: string): Promise<Tier> {
  return (await _readEffectiveTier(orgId)) as Tier
}

/** Line-honest tier for the product-line-aware route guard (requireRouteTier/requireMinTier). Typed AnyTier
 *  because an HOA org's subscription genuinely holds an hoa_* literal; hasAccess() then compares within the
 *  org's line and denies cross-line. Same underlying read as getOrgTierCanonical — never a second query. */
export async function getOrgTierAny(orgId: string): Promise<AnyTier> {
  return (await _readEffectiveTier(orgId)) as AnyTier
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
