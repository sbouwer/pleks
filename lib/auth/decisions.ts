/**
 * lib/auth/decisions.ts — Auth routing decision core (ADDENDUM_AUTH_CONTRACT §5)
 *
 * Pure functions only. No Supabase, no Next.js, no cookies, no Request.
 * Every routing decision Pleks makes is one of: resolveAuthDestination or routeGateDecision.
 * Policy lives here and nowhere else.
 */

export type Aal = "aal1" | "aal2"
export type RoleClass = "agent" | "tenant" | "landlord" | "supplier"
export type AgentRole =
  | "owner" | "property_manager" | "agent" | "accountant" | "maintenance_manager"
export type SessionRole = AgentRole | "tenant" | "landlord" | "supplier" | "contractor"

export interface AuthFacts {
  isAuthenticated: boolean
  userId?: string            // set when isAuthenticated; used for audit logging

  membership: {
    exists: boolean
    roleClass?: RoleClass        // present iff exists
    sessionRole?: SessionRole    // concrete role for gate matching; present iff exists
    orgId?: string
  }

  assurance: {
    current: Aal
    hasVerifiedFactor: boolean   // global — no host filter (D1)
    // NB: `required` is NOT a field here. It is derived policy — see requiredAssurance().
  }

  onboarding: {
    complete: boolean            // resolver branches only on complete-vs-not
    welcomeSeen: boolean         // ADDENDUM_RESOLVER_OWNED_WELCOME §4 — resolver gates welcome on this
  }

  consent: {
    current: boolean             // accepted ToS + Privacy versions match LEGAL_VERSIONS
    everAccepted?: boolean       // has the user ever accepted any version? (resolver only — DB truth)
  }

  route: {
    path: string                 // the path under decision (gate) / the safeNext target (resolver)
    isPublic: boolean
    requiresAal2: boolean
    allowedRoles: readonly SessionRole[] | null
  }

  safeNext: string | null        // already passed through safeRedirect(); null if absent/rejected
}

export const PORTAL_DEFAULTS: Record<RoleClass, string> = {
  agent:    "/dashboard",
  tenant:   "/tenant/dashboard",
  landlord: "/landlord/dashboard",
  supplier: "/supplier/dashboard",
}

export const PORTAL_PREFIXES: Record<RoleClass, readonly string[]> = {
  agent: [
    "/dashboard", "/settings", "/properties", "/tenants", "/landlords",
    "/leases", "/listings", "/applications", "/billing", "/finance", "/suppliers",
    "/maintenance", "/inspections", "/calendar", "/reports", "/documents",
    "/hoa", "/managing-schemes", "/utilities", "/statements", "/help",
  ],
  tenant:   ["/tenant"],
  landlord: ["/landlord"],
  supplier: ["/supplier"],
}

export function canAccessPath(rc: RoleClass, path: string): boolean {
  return PORTAL_PREFIXES[rc].some((p) => path === p || path.startsWith(p + "/"))
}

/** MFA mandatory for agent-class only (D3). */
export function mfaMandatoryFor(rc: RoleClass): boolean {
  return rc === "agent"
}

/**
 * Derived policy — purely route-driven. AAL is a property of the destination, not the class.
 * Agent workspace routes have requiresAal2:true in the manifest; enrolment islands (/settings)
 * do not, so an unenrolled agent can reach them. collectResolverFacts sets route.requiresAal2
 * from the effective destination manifest rule, so the resolver correctly pushes agents into
 * enrolment when their default destination (/dashboard) requires AAL2.
 */
export function requiredAssurance(f: AuthFacts): Aal {
  if (f.route.requiresAal2) return "aal2"
  return "aal1"
}

// Destination union — added "welcome" per ADDENDUM_RESOLVER_OWNED_WELCOME_2026-05-28 §4.
export type Destination =
  | { kind: "login";       redirect: string | null }
  | { kind: "onboarding" }
  | { kind: "severed" }
  | { kind: "first_login"; redirect: string | null }
  | { kind: "welcome";     redirect: string | null }
  | { kind: "mfa_verify";  redirect: string | null }
  | { kind: "mfa_enrol";   redirect: string | null }
  | { kind: "app"; path: string; pendingConsent: boolean }

/** ADDENDUM_AUTH_CONTRACT §3. The whole routing contract. */
export function resolveAuthDestination(f: AuthFacts): Destination {
  if (!f.isAuthenticated) return { kind: "login", redirect: f.safeNext }

  if (!f.membership.exists) {
    return f.onboarding.complete ? { kind: "severed" } : { kind: "onboarding" }
  }

  const rc = f.membership.roleClass as RoleClass   // exists ⇒ present

  // First-time users: never accepted terms AND no MFA factor yet.
  // Show the first-login wizard before forcing MFA enrolment.
  if (f.consent.everAccepted === false && !f.assurance.hasVerifiedFactor) {
    return { kind: "first_login", redirect: f.safeNext }
  }

  // Resolver-owned Welcome (ADDENDUM_RESOLVER_OWNED_WELCOME §4):
  // - Agent-class only (Phase 1; portal welcome is Phase 2).
  // - Gates on !welcomeSeen && current !== "aal2".
  // - Factor presence doesn't matter — orient first, then verify or enrol.
  // - Order is load-bearing: must precede the AAL2 gate.
  if (rc === "agent" && !f.onboarding.welcomeSeen && f.assurance.current !== "aal2") {
    return { kind: "welcome", redirect: f.safeNext }
  }

  if (requiredAssurance(f) === "aal2" && f.assurance.current !== "aal2") {
    return f.assurance.hasVerifiedFactor
      ? { kind: "mfa_verify", redirect: f.safeNext }
      : { kind: "mfa_enrol",  redirect: f.safeNext }
  }

  const path = f.safeNext && canAccessPath(rc, f.safeNext) ? f.safeNext : PORTAL_DEFAULTS[rc]
  return { kind: "app", path, pendingConsent: !f.consent.current }
}

export type GateOutcome =
  | { action: "allow" }
  | { action: "to_login" }
  | { action: "to_resolver" }
  | { action: "forbidden" }

/** Middleware brain. Fail-closed: missing role on a role-gated route → resolver, never allow. */
export function routeGateDecision(f: AuthFacts): GateOutcome {
  if (f.route.isPublic) return { action: "allow" }
  if (!f.isAuthenticated) return { action: "to_login" }
  if (requiredAssurance(f) === "aal2" && f.assurance.current !== "aal2") {
    return { action: "to_resolver" }
  }
  if (f.route.allowedRoles && f.route.allowedRoles.length > 0) {
    if (!f.membership.sessionRole) return { action: "to_resolver" }
    if (!f.route.allowedRoles.includes(f.membership.sessionRole)) return { action: "forbidden" }
  }
  return { action: "allow" }
}
