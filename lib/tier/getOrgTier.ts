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
 *         THERE IS NO LONGER A FORGEABLE READER ANYWHERE. A cookie fast-path used to be the third
 *         export here, was split out to ./getOrgTierFromCookie on 2026-08-23 so a lint rule could
 *         name it by module path, and was deleted the same day when the CD ruling removed `tier`
 *         from getServerOrgMembership's return — with nothing forgeable left to fast-path, that
 *         module's whole body reduced to `return getOrgTierCanonical(orgId)`. The invariant it
 *         guarded now holds by construction: no code path produces a tier that did not come from
 *         `subscriptions`. Do not reintroduce one; put the memoisation in _readEffectiveTier instead.
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
 *  HOA line (an HOA org never reaches them). Display surfaces call this too — since the forgeable cookie
 *  reader was deleted there is no cheaper answer, and a badge showing a tier the org has not paid for is
 *  not a cheaper answer either. Costs one `subscriptions` read per call; see the module header. */
export async function getOrgTierCanonical(orgId: string): Promise<Tier> {
  return (await _readEffectiveTier(orgId)) as Tier
}

/** Line-honest tier for the product-line-aware route guard (requireRouteTier/requireMinTier). Typed AnyTier
 *  because an HOA org's subscription genuinely holds an hoa_* literal; hasAccess() then compares within the
 *  org's line and denies cross-line. Same underlying read as getOrgTierCanonical — never a second query. */
export async function getOrgTierAny(orgId: string): Promise<AnyTier> {
  return (await _readEffectiveTier(orgId)) as AnyTier
}
