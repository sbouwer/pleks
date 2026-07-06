/**
 * lib/auth/requireCapability.ts — server route guard for capability-gated surfaces (RBAC P4 STEP 2)
 *
 * Auth:   gatewaySSR + the given capability (owner / is_admin exempt). Call at the top of a route layout:
 *           export default async function Layout({ children }) { await requireCapability("properties"); return children }
 * Notes:  Redirects unauthenticated → /login, non-capable → /403. Affordance (nav) is separate; this + the
 *         server action checks + RLS are the boundary.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import { getOrgTierAny } from "@/lib/tier/getOrgTier"
import { tierFloorForPath, productLineForTier, hasAccess } from "@/lib/tier/gates"
import type { AnyTier } from "@/lib/constants"

export async function requireCapability(capability: string): Promise<void> {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!(await hasCapability(gw, capability))) redirect("/403")
}

/**
 * Tier route guard (RBAC P4 — hard-block tier-gated surfaces, not just hide the nav). Uses the line-honest
 * canonical tier (subscriptions, not the forgeable cookie). Tier is a plan limit, NOT a permission —
 * owner/is_admin are NOT exempt (a Firm feature is unreachable on Steward until they upgrade). Comparison is
 * via hasAccess, which is WITHIN a product line — a cross-line pair (e.g. an HOA tier vs a residential
 * min-tier) is a deliberate deny (/403), never an undefined TIER_ORDER comparison that happens to be false.
 */
export async function requireMinTier(minTier: AnyTier): Promise<void> {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const tier = await getOrgTierAny(gw.orgId)
  if (!hasAccess(tier, minTier)) redirect("/403")
}

/**
 * Tier route guard whose floor comes from the SSOT (tierFloorForPath) — keeps nav + route in lockstep.
 * Product-line-aware: the floor is resolved against the ORG's line, so an HOA org meets the HOA-line floor
 * (currently none → always admitted) while a residential org still meets the residential floor.
 */
export async function requireRouteTier(route: string): Promise<void> {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const tier = await getOrgTierAny(gw.orgId)
  const floor = tierFloorForPath(route, productLineForTier(tier))
  if (floor && !hasAccess(tier, floor)) redirect("/403")
}
