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
import { verifyPasskeyAal, jwtIdentity, PASSKEY_AAL_COOKIE } from "@/lib/auth/passkey-aal"
import { passkeyAalRevoked } from "@/lib/auth/passkey-aal-db"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ── Minimal Supabase interface — only what the resolver needs ─────────────────
interface ResolverSupabase {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } }>
    getSession(): Promise<{ data: { session: { access_token?: string } | null } }>
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

function membershipWithRole(orgId: string, sessionRole: SessionRole): AuthFacts["membership"] {
  return { exists: true, roleClass: deriveRoleClass(sessionRole), sessionRole, orgId }
}

/**
 * Resolves gate membership purely from the two org cookies, in priority order:
 *   1. pleks_org.role     — freshest (300s); authoritative role for the current org
 *   2. pleks_has_org.role — durable (7d); survives pleks_org lapsing mid-flow (loop-class fix)
 *   3. pleks_has_org.portal_class — non-agent portals carry class instead of a role
 *   4. org_id only        — last resort: membership exists but role unknown (gate fails closed)
 * Never throws — malformed cookies yield { exists: false }.
 */
function membershipFromCookies(
  hasOrgRaw: string | undefined,
  orgRaw: string | undefined
): AuthFacts["membership"] {
  if (!hasOrgRaw) return { exists: false }
  let hasOrg: { org_id?: string; role?: string; portal_class?: string }
  try {
    hasOrg = JSON.parse(hasOrgRaw)
  } catch { return { exists: false } }
  if (!hasOrg.org_id) return { exists: false }

  if (orgRaw) {
    try {
      const org = JSON.parse(orgRaw) as { role?: string }
      if (org.role) return membershipWithRole(hasOrg.org_id, org.role as SessionRole)
    } catch { /* malformed pleks_org — fall through to durable fallbacks */ }
  }
  if (hasOrg.role)         return membershipWithRole(hasOrg.org_id, hasOrg.role as SessionRole)
  if (hasOrg.portal_class) return membershipWithRole(hasOrg.org_id, hasOrg.portal_class as SessionRole)
  return { exists: true, orgId: hasOrg.org_id }
}

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

  const membership = membershipFromCookies(
    request.cookies.get("pleks_has_org")?.value,
    request.cookies.get("pleks_org")?.value,
  )

  return {
    isAuthenticated,
    membership,
    assurance: {
      current:          aal === "aal2" ? "aal2" : "aal1",
      hasVerifiedFactor: false, // gate never reads factors (§7)
    },
    onboarding: { complete: false, welcomeSeen: false }, // gate doesn't branch on onboarding/welcome
    consent:    { current: consentCurrent(request), everAccepted: true },
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
      onboarding:  { complete: false, welcomeSeen: false },
      consent:     { current: consentCurrent(request) },
      route: { path: safeNext ?? "/dashboard", isPublic: false, requiresAal2: false, allowedRoles: null },
      safeNext,
    }
  }

  // ── Profile (always read — onboarding state + welcome gate) ───────────────
  // Hoisted above membership so welcomeSeen is available regardless of whether
  // membership resolves — welcome branch only fires when membership exists, but
  // reading here avoids a second createServiceClient() call later for consent.
  const service = await createServiceClient()
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("onboarding_state, welcome_seen")
    .eq("id", user.id)
    .maybeSingle()
    logQueryError("collectResolverFacts user_profiles", profileError)
  const welcomeSeen = profile?.welcome_seen ?? false  // default false → show Welcome rather than skip

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
  const supabaseAal: Aal  = aalData?.currentLevel === "aal2" ? "aal2" : "aal1"

  // Passkey-AAL2 (ADDENDUM_69 Slice A): OR-in the signed signal, bound to the LIVE session,
  // then confirm the grant isn't revoked (the resolver can afford the DB read; the gate runs
  // the same verifier minus this check). Same verifier as the gate ⇒ no gate↔resolver divergence.
  let passkeyAal2 = false
  const aalCookie = request.cookies.get(PASSKEY_AAL_COOKIE)?.value
  if (aalCookie) {
    const { data: { session } } = await supabase.auth.getSession()
    const sessionId = jwtIdentity(session?.access_token).sessionId
    if (verifyPasskeyAal(aalCookie, { userId: user.id, sessionId })) {
      passkeyAal2 = !(await passkeyAalRevoked(sessionId))
    }
  }
  const currentAal: Aal = supabaseAal === "aal2" || passkeyAal2 ? "aal2" : "aal1"

  // ── Factor check (global — no host filter, D1) ────────────────────────────
  // hasVerifiedFactor is a durable factor-POSSESSION fact (does this user own any MFA factor to
  // verify against?), distinct from the ephemeral pleks_aal *assurance* signal above — do NOT
  // derive it from the cookie. It drives ONLY the resolver's mfa_verify-vs-mfa_enrol choice.
  // Since ADDENDUM_69 made a passkey AAL2-granting, an enrolled passkey counts as a factor: a
  // passkey-only user at aal1 (e.g. a password login) must be routed to VERIFY with their passkey,
  // not force-enrolled into TOTP. Read user_passkeys directly (service client); fail-closed — a
  // passkey read error falls back to the TOTP-only result.
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totpVerified = (factors?.totp ?? []).some((f) => f.status === "verified")
  let passkeyExists = false
  const { data: passkeys, error: passkeyErr } = await service
    .from("user_passkeys")
    .select("id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1)
  if (passkeyErr) console.error("[facts] user_passkeys read failed:", passkeyErr.message)
  else passkeyExists = (passkeys?.length ?? 0) > 0
  const hasVerifiedFactor = totpVerified || passkeyExists

  // ── Consent — has user ever accepted any ToS version? ─────────────────────
  const { data: anyAcceptance, error: anyAcceptanceError } = await service
    .from("tos_acceptances")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()
    logQueryError("collectResolverFacts tos_acceptances", anyAcceptanceError)
  const everAccepted = !!anyAcceptance

  return {
    isAuthenticated: true,
    userId: user.id,
    membership,
    assurance: { current: currentAal, hasVerifiedFactor },
    onboarding: { complete: onboardingComplete, welcomeSeen },
    consent:    { current: consentCurrent(request), everAccepted },
    route: {
      path:         safeNext ?? "/dashboard",
      isPublic:     false,
      requiresAal2: resolverRouteRequiresAal2(membership, safeNext),
      allowedRoles: null,
    },
    safeNext,
  }
}
