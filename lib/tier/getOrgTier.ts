/**
 * lib/tier/getOrgTier.ts — The AUTHORITATIVE org tier read. Every resolver here is gate-safe.
 *
 * Auth:   Server-only; service client (bypasses RLS, so org_id is passed explicitly).
 * Data:   subscriptions table.
 * Notes:  getOrgTierCanonical is the ONLY resolver for entitlement gates.
 *         getOrgTierAny is the SAME read, typed as AnyTier for the product-line-aware route guard
 *         (an HOA org's subscriptions.tier genuinely holds an hoa_* literal). Both go through one
 *         _readEffectiveTier() so the two views can never drift (ADDENDUM_18C).
 *
 *         The FORGEABLE cookie fast-path used to be the third export in this file. It now lives in
 *         ./getOrgTierFromCookie — see that module for why. Keep this file authoritative-only: a
 *         forgeable reader sharing an import line with a gate reader is a typo away from a security
 *         defect, and the separation is what lets the invariant be checked by module path.
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { Tier, AnyTier } from "@/lib/constants"
import { getEffectiveTier } from "./effectiveTier"
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
 *  HOA line (an HOA org never reaches them). The cookie fast-path (./getOrgTierFromCookie) is forgeable
 *  and display-only — this is the function it falls back to, and the only one a gate may call. */
export async function getOrgTierCanonical(orgId: string): Promise<Tier> {
  return (await _readEffectiveTier(orgId)) as Tier
}

/** Line-honest tier for the product-line-aware route guard (requireRouteTier/requireMinTier). Typed AnyTier
 *  because an HOA org's subscription genuinely holds an hoa_* literal; hasAccess() then compares within the
 *  org's line and denies cross-line. Same underlying read as getOrgTierCanonical — never a second query. */
export async function getOrgTierAny(orgId: string): Promise<AnyTier> {
  return (await _readEffectiveTier(orgId)) as AnyTier
}
