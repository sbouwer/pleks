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
  "/login/mfa":             { auth: true,  skipOrgCheck: true },
  "/login/first-setup":     { auth: true,  skipOrgCheck: true },
  "/forgot-password":       { auth: false },
  "/reset-password":        { auth: false },
  "/register":              { auth: false },
  "/onboarding":            { auth: false },
  "/onboarding/severed":    { auth: true,  skipOrgCheck: true },
  "/accept-terms":          { auth: true,  skipOrgCheck: true },
  "/pricing":               { auth: false },
  "/privacy":               { auth: false },
  "/terms":                 { auth: false },
  "/credit-check-policy":   { auth: false },
  "/contact":               { auth: false },
  "/definitions":           { auth: false },
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

  // ── Post-onboarding / invite Welcome interstitial (AAL1 island — TOTP not yet enrolled) ──
  // No `roles` here: skipOrgCheck means the org cookie (which carries the role) is never
  // hydrated, so a role-gated rule would fail closed and bounce to the resolver forever.
  // The /welcome page reads membership itself and is benign for any authenticated user.
  "/welcome":               { auth: true, skipOrgCheck: true },

  // ── Auth utility routes ──
  "/select-role":           { auth: true,  skipOrgCheck: true },
  "/403":                   { auth: false },

  // ── Enrolment island (longest-prefix beats /settings) ──
  // Agents reach this at AAL1 to enrol their first factor. skipOrgCheck so the gate
  // never needs pleks_org's role here: this is a resolver-targeted MFA destination and
  // must be reachable whenever the resolver sends an AAL1 agent to enrol, regardless of
  // org-cookie freshness (pleks_org is 300s; welcome→enrol→verify can exceed it). Loop-class fix.
  "/settings/security/enrol-totp": { auth: true, skipOrgCheck: true, requiresAal2: false },

  // ── Agent workspace (unprefixed) — requiresAal2 blocks AAL1 sessions ──
  // /settings is intentionally AAL1-accessible so agents can enrol their first
  // TOTP factor before they have an AAL2 session.
  // /help (Help Centre index) serves ALL authenticated roles, AAL1 (read-only, low-sensitivity;
  // tenants are aal1) — BUILD_68 OQ1=A. skipOrgCheck because non-agent roles have no agent org to
  // hydrate (matches the portal routes). The more-specific /help/fitscore-report rule keeps the
  // agent-only FitScore guide gated (longest-prefix wins) so widening /help can't expose it — its
  // URL is stamped into generated screening PDFs and must keep resolving.
  "/help":                  { auth: true, skipOrgCheck: true },
  "/help/fitscore-report":  { auth: true, roles: AGENT_ROLES },
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

/**
 * Longest-prefix lookup — same logic as matchManifest in proxy.ts, exported for
 * use in fact collectors so the resolver can derive route.requiresAal2 from the
 * destination manifest rule without duplicating the matching algorithm.
 */
export function lookupManifestRule(path: string): RouteRule | null {
  let best: string | null = null
  for (const prefix of Object.keys(ROUTE_MANIFEST)) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.length) best = prefix
    }
  }
  return best ? ROUTE_MANIFEST[best] : null
}
