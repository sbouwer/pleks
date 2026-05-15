/**
 * lib/routing/manifest.ts — Route auth manifest consumed by proxy.ts middleware
 *
 * Auth:   Read-only by proxy.ts — no auth required to read this module
 * Notes:  Longest-match wins. Every path prefix the app serves must have an entry.
 *         Webhook/cron/auth/admin API routes are handled separately in proxy.ts.
 */
export const AGENT_ROLES = [
  "owner",
  "property_manager",
  "agent",
  "accountant",
  "maintenance_manager",
] as const

export type AgentRole = typeof AGENT_ROLES[number]
export type PortalRole = "tenant" | "landlord" | "supplier" | "contractor"
export type SessionRole = AgentRole | PortalRole

export interface RouteRule {
  auth: boolean
  roles?: readonly SessionRole[]
  skipOrgCheck?: boolean
  tokenGated?: boolean
  /** If true, proxy enforces AAL2 (completed MFA) before allowing access. */
  requiresAal2?: boolean
}

/**
 * Every path prefix the app serves must have a manifest entry.
 * Longest match wins — new routes MUST be added here before shipping.
 *
 * Webhook and API routes are handled separately in proxy.ts:
 *   /api/webhooks/*   → always public (HMAC-verified by handler)
 *   /api/cron/*       → always public (secret-verified by handler)
 *   /api/auth/*       → Supabase auth flows, public
 *   /api/admin/*      → admin auth (separate)
 *   /api/*            → inherits auth from calling context
 */
export const ROUTE_MANIFEST: Record<string, RouteRule> = {
  // ── Public ──
  "/":                      { auth: false },
  "/login":                 { auth: false },
  "/forgot-password":       { auth: false },
  "/reset-password":        { auth: false },
  "/register":              { auth: false },
  "/onboarding":            { auth: true,  skipOrgCheck: true },
  "/accept-terms":          { auth: true,  skipOrgCheck: true },
  "/pricing":               { auth: false },
  "/privacy":               { auth: false },
  "/terms":                 { auth: false },
  "/credit-check-policy":   { auth: false },
  "/contact":               { auth: false },
  "/for-agents":            { auth: false },
  "/for-landlords":         { auth: false },
  "/early-access":          { auth: false },
  "/migrate":               { auth: false },
  "/status":                { auth: false },

  // ── Public token-gated ──
  "/apply":                 { auth: false, tokenGated: true },
  "/invite":                { auth: false, tokenGated: true },
  "/public":                { auth: false, tokenGated: true },
  "/sign-signature":        { auth: false, tokenGated: true },
  "/property-info":         { auth: false, tokenGated: true },

  // ── Demo (public, fake data) ──
  "/demo":                  { auth: false },

  // ── Admin (separate auth, handled by checkAdminAuth in proxy.ts) ──
  "/admin":                 { auth: false },

  // ── Supabase auth callbacks ──
  "/auth":                  { auth: false },

  // ── Role-prefixed portals ──
  "/tenant":                { auth: true, roles: ["tenant"],                          skipOrgCheck: true },
  "/landlord":              { auth: true, roles: ["landlord"],                        skipOrgCheck: true },
  "/supplier":              { auth: true, roles: ["supplier", "contractor"],           skipOrgCheck: true },

  // ── Multi-role navigation (ADDENDUM_61B) ──
  "/select-role":           { auth: true,  skipOrgCheck: true },
  "/switch-role":           { auth: true,  skipOrgCheck: true },
  "/403":                   { auth: false },

  // ── Agent workspace (unprefixed) — requiresAal2 blocks AAL1 sessions ──
  // /settings is intentionally AAL1-accessible so agents can enrol their first
  // TOTP factor before they have an AAL2 session.
  "/settings":              { auth: true, roles: AGENT_ROLES },
  "/dashboard":             { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/properties":            { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/tenants":               { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/landlords":             { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/leases":                { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/applications":          { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/billing":               { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/finance":               { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/suppliers":             { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/maintenance":           { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/inspections":           { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/calendar":              { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/reports":               { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/documents":             { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/hoa":                   { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/managing-schemes":      { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/utilities":             { auth: true, roles: AGENT_ROLES, requiresAal2: true },
  "/statements":            { auth: true, roles: AGENT_ROLES, requiresAal2: true },

  // ── Marketing (apex-only in production; /marketing/* prefix in dev/preview) ──
  "/marketing":             { auth: false },
} as const
