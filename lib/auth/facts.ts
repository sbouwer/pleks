/**
 * lib/auth/facts.ts — Auth fact collectors (ADDENDUM_AUTH_CONTRACT §7)
 *
 * Two collectors, one AuthFacts shape. No decision logic here.
 * collectGateFacts: cheap, reads cookies + JWT claim — no DB calls.
 * collectResolverFacts: canonical, hits DB for membership + AAL.
 */
import type { NextRequest } from "next/server"
import type { AuthFacts, Aal, RoleClass, SessionRole } from "@/lib/auth/decisions"
import { canAccessPath, PORTAL_DEFAULTS } from "@/lib/auth/decisions"
import type { RouteRule } from "@/lib/routing/manifest"
import { lookupManifestRule } from "@/lib/routing/manifest"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { resolveUserMembership, SovereignMembershipViolation } from "@/lib/auth/membership"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { createServiceClient } from "@/lib/supabase/server"

// ── Minimal Supabase interface — only what the resolver needs ─────────────────
interface ResolverSupabase {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } }>
    mfa: {
      getAuthenticatorAssuranceLevel(): Promise<{ data: { currentLevel: string | null } | null }>
      listFactors(): Promise<{ data: { totp: Array<{ status: string }> } | null }>
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Computes whether the resolver's effective destination requires AAL2.
 * Looks up the manifest rule for the path the resolver would actually land on:
 * safeNext (if the user can access it) or the portal default. This is what makes
 * requiredAssurance purely route-driven — the collector bakes in the manifest flag
 * so the decision core never needs to know which class drives what.
 */
function resolverRouteRequiresAal2(
  membership: AuthFacts["membership"],
  safeNext: string | null
): boolean {
  if (!membership.exists || !membership.roleClass) return false
  const rc = membership.roleClass as RoleClass
  const effectivePath = safeNext && canAccessPath(rc, safeNext) ? safeNext : PORTAL_DEFAULTS[rc]
  return lookupManifestRule(effectivePath)?.requiresAal2 ?? false
}

const AGENT_ROLE_VALUES = new Set<string>([
  "owner", "property_manager", "agent", "accountant", "maintenance_manager",
])

function deriveRoleClass(sr: SessionRole): RoleClass {
  if (AGENT_ROLE_VALUES.has(sr)) return "agent"
  if (sr === "supplier" || sr === "contractor") return "supplier"
  return sr as RoleClass
}

function consentCurrent(request: NextRequest): boolean {
  const tos     = request.cookies.get("pleks_tos_version")?.value
  const privacy = request.cookies.get("pleks_privacy_version")?.value
  return tos === LEGAL_VERSIONS.terms && privacy === LEGAL_VERSIONS.privacy
}

// ── Gate collector — cheap, no DB ─────────────────────────────────────────────
/**
 * Builds AuthFacts from cookies + JWT aal claim.
 * Called from middleware after updateSession() and ensureOrgCookies().
 * Reads request.cookies; never hits Supabase or the DB.
 */
export function collectGateFacts(
  request: NextRequest,
  rule: RouteRule,
  session: { isAuthenticated: boolean; aal: string | null }
): AuthFacts {
  const { isAuthenticated, aal } = session

  let membership: AuthFacts["membership"] = { exists: false }

  const hasOrgRaw = request.cookies.get("pleks_has_org")?.value
  const orgRaw    = request.cookies.get("pleks_org")?.value

  if (hasOrgRaw) {
    try {
      const hasOrg = JSON.parse(hasOrgRaw) as { org_id?: string; portal_class?: string }

      if (orgRaw) {
        try {
          const org = JSON.parse(orgRaw) as { role?: string }
          if (org.role && hasOrg.org_id) {
            const sessionRole = org.role as SessionRole
            membership = {
              exists: true,
              roleClass:   deriveRoleClass(sessionRole),
              sessionRole,
              orgId: hasOrg.org_id,
            }
          }
        } catch { /* malformed pleks_org — fall through */ }
      }

      if (!membership.exists && hasOrg.portal_class && hasOrg.org_id) {
        const sessionRole = hasOrg.portal_class as SessionRole
        membership = {
          exists: true,
          roleClass:   deriveRoleClass(sessionRole),
          sessionRole,
          orgId: hasOrg.org_id,
        }
      }

      if (!membership.exists && hasOrg.org_id) {
        membership = { exists: true, orgId: hasOrg.org_id }
      }
    } catch { /* malformed pleks_has_org */ }
  }

  return {
    isAuthenticated,
    membership,
    assurance: {
      current:          aal === "aal2" ? "aal2" : "aal1",
      hasVerifiedFactor: false, // gate never reads factors (§7)
    },
    onboarding: { complete: false }, // gate doesn't branch on onboarding
    consent:    { current: consentCurrent(request) },
    route: {
      path:         request.nextUrl.pathname,
      isPublic:     !rule.auth,
      requiresAal2: rule.requiresAal2 ?? false,
      allowedRoles: (rule.roles as readonly SessionRole[] | undefined) ?? null,
    },
    safeNext: null, // gate builds login redirect directly
  }
}

// ── Resolver collector — canonical, hits DB ───────────────────────────────────
/**
 * Builds AuthFacts from a canonical DB + Supabase auth read.
 * Called from /auth/resolver once per routing decision.
 */
export async function collectResolverFacts(
  request: NextRequest,
  supabase: ResolverSupabase
): Promise<AuthFacts> {
  const redirectParam = new URL(request.url).searchParams.get("redirect")
  const safeNext      = redirectParam ? safeRedirect(redirectParam) : null

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      isAuthenticated: false,
      membership:  { exists: false },
      assurance:   { current: "aal1", hasVerifiedFactor: false },
      onboarding:  { complete: false },
      consent:     { current: consentCurrent(request) },
      route: { path: safeNext ?? "/dashboard", isPublic: false, requiresAal2: false, allowedRoles: null },
      safeNext,
    }
  }

  // ── Membership (canonical DB) ─────────────────────────────────────────────
  let membership: AuthFacts["membership"] = { exists: false }
  let onboardingComplete = false

  try {
    const m = await resolveUserMembership(user.id)

    if (m) {
      const sessionRole: SessionRole = m.portalClass === "agent"
        ? ((m.orgRole ?? "owner") as SessionRole)
        : (m.portalClass as SessionRole)
      membership = {
        exists:     true,
        roleClass:  m.portalClass,
        sessionRole,
        orgId:      m.orgId,
      }
    } else {
      const service = await createServiceClient()
      const { data: profile } = await service
        .from("user_profiles")
        .select("onboarding_state")
        .eq("id", user.id)
        .maybeSingle()
      onboardingComplete = profile?.onboarding_state === "complete"
    }
  } catch (err) {
    if (err instanceof SovereignMembershipViolation) {
      // Two active memberships → sovereignty violation → route to severed
      onboardingComplete = true
    }
    // Other errors: membership stays { exists: false } → routes to /onboarding
  }

  // ── AAL ───────────────────────────────────────────────────────────────────
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const currentAal: Aal   = aalData?.currentLevel === "aal2" ? "aal2" : "aal1"

  // ── Factor check (global — no host filter, D1) ────────────────────────────
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const hasVerifiedFactor  = (factors?.totp ?? []).some((f) => f.status === "verified")

  return {
    isAuthenticated: true,
    userId: user.id,
    membership,
    assurance: { current: currentAal, hasVerifiedFactor },
    onboarding: { complete: onboardingComplete },
    consent:    { current: consentCurrent(request) },
    route: {
      path:         safeNext ?? "/dashboard",
      isPublic:     false,
      requiresAal2: resolverRouteRequiresAal2(membership, safeNext),
      allowedRoles: null,
    },
    safeNext,
  }
}
