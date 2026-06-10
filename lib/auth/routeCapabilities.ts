/**
 * lib/auth/routeCapabilities.ts — route → required capability map (RBAC P4 nav SSOT)
 *
 * Notes:  The single source for which capability a route needs, read by BOTH the desktop nav (Sidebar /
 *         SettingsSidebar) and the mobile nav (MobileHomeScreen / MobileSettingsNav) via useNavGate, so the
 *         two paths can't drift. Keyed by route PREFIX (a child path inherits via capabilityForPath, e.g.
 *         /finance/deposits → finance, /settings/documents/templates → documents). Pairs with
 *         ROUTE_TIER_FLOORS (lib/tier/gates) for the tier axis. Owner/is_admin hold every capability.
 *         Unlisted routes (dashboard, settings overview, own profile/security/notifications/feedback) are
 *         ungated. The route LAYOUT guards remain the enforcement boundary; this drives nav affordance.
 */
export const ROUTE_CAPABILITY: Record<string, string> = {
  // main workspace
  "/properties":   "properties",
  "/hoa":          "properties",
  "/landlords":    "landlords",
  "/tenants":      "tenants",
  "/suppliers":    "maintenance",
  "/leases":       "leases",
  "/applications": "applications",
  "/maintenance":  "maintenance",
  "/inspections":  "inspections",
  "/finance":      "finance",   // covers /finance/deposits, /finance/trust-ledger
  "/statements":   "finance",
  "/billing":      "billing",
  "/reports":      "reports",
  // settings (route prefixes — mobile uses more granular children that inherit by prefix)
  "/settings/details":        "org",
  "/settings/branding":       "org",
  "/settings/configuration":  "org",
  "/settings/hours":          "org",
  "/settings/team":           "team",
  "/settings/documents":      "documents",
  "/settings/lease-templates": "documents",
  "/settings/compliance":     "org",
  "/settings/subscription":   "billing",
  "/settings/deposits":       "finance",
  "/settings/import":         "org",
}

/** The capability required for `path` (longest matching route prefix), or null if the route is ungated. */
export function capabilityForPath(path: string): string | null {
  let cap: string | null = null
  let bestLen = -1
  for (const [route, capability] of Object.entries(ROUTE_CAPABILITY)) {
    if ((path === route || path.startsWith(route + "/")) && route.length > bestLen) {
      cap = capability
      bestLen = route.length
    }
  }
  return cap
}
