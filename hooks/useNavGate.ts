"use client"

/**
 * hooks/useNavGate.ts — the shared nav-visibility predicate (RBAC P4)
 *
 * Notes:  Returns `canSee(path)` combining BOTH gating axes from their SSOTs — capability
 *         (ROUTE_CAPABILITY / useCapabilities, fail-open while hydrating) and tier
 *         (ROUTE_TIER_FLOORS / useTier). Desktop (Sidebar, SettingsSidebar) and mobile
 *         (MobileHomeScreen, MobileSettingsNav) all filter through this, so the two paths share one gate.
 *         Org-type gates (hasHOA / hasLandlordsList / hasTeam …) stay per-component — a different axis.
 *         Affordance only; the route layout guards are the boundary.
 */
import { useCapabilities } from "@/components/auth/CapabilitiesProvider"
import { useTier } from "@/hooks/useTier"
import { capabilityForPath } from "@/lib/auth/routeCapabilities"
import { tierFloorForPath, hasAccess } from "@/lib/tier/gates"

export function useNavGate(): (path: string) => boolean {
  const { has } = useCapabilities()
  const { tier } = useTier()
  return (path: string): boolean => {
    const clean = path.split(/[?#]/)[0]  // strip query/hash so "/tenants?add=1" still matches "/tenants"
    const cap = capabilityForPath(clean)
    if (cap && !has(cap)) return false
    const floor = tierFloorForPath(clean)
    if (floor && !hasAccess(tier, floor)) return false
    return true
  }
}
