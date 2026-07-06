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
import { tierFloorForPath, hasAccess, productLineForTier } from "@/lib/tier/gates"

export function useNavGate(): (path: string) => boolean {
  const { has } = useCapabilities()
  const { tier } = useTier()
  return (path: string): boolean => {
    const clean = path.split(/[?#]/)[0]  // strip query/hash so "/tenants?add=1" still matches "/tenants"
    const cap = capabilityForPath(clean)
    if (cap && !has(cap)) return false
    // Resolve the floor within the org's line — a residential floor must never cross-line-deny an HOA org
    // (Stage 2 hasAccess would otherwise hide /hoa, /finance, /settings for the HOA line).
    const floor = tierFloorForPath(clean, productLineForTier(tier))
    if (floor && !hasAccess(tier, floor)) return false
    return true
  }
}
