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
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { ROUTE_TIER_FLOORS } from "@/lib/tier/gates"
import { TIER_ORDER, type Tier } from "@/lib/constants"

export async function requireCapability(capability: string): Promise<void> {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!(await hasCapability(gw, capability))) redirect("/403")
}

/**
 * Tier route guard (RBAC P4 — hard-block tier-gated surfaces, not just hide the nav). Uses the CANONICAL
 * tier (subscriptions, not the forgeable cookie). Tier is a plan limit, NOT a permission — owner/is_admin are
 * NOT exempt (a Firm feature is unreachable on Steward until they upgrade). Redirects below the minimum → /403.
 */
export async function requireMinTier(minTier: Tier): Promise<void> {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const tier = await getOrgTierCanonical(gw.orgId)
  if (TIER_ORDER[tier] < TIER_ORDER[minTier]) redirect("/403")
}

/** Tier route guard whose floor comes from the SSOT (ROUTE_TIER_FLOORS) — keeps nav + route in lockstep. */
export async function requireRouteTier(route: keyof typeof ROUTE_TIER_FLOORS): Promise<void> {
  await requireMinTier(ROUTE_TIER_FLOORS[route])
}
