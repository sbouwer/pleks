/**
 * app/(auth)/auth/resolver/route.ts — singular post-authentication routing authority
 *
 * Route:  GET /auth/resolver
 *         GET /auth/resolver?redirect=<safe-path>
 * Auth:   public (issues redirects only; no UI render; resolves session internally)
 * Notes:  Implements §3.2 decision tree from ADDENDUM_AUTH_RESOLVER.
 *         This is the ONLY route permitted to make role-class routing decisions (I-1).
 *         Every decision is logged to auth_events for audit (D-AUTH-RESOLVER-15).
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { resolveUserMembership, SovereignMembershipViolation } from "@/lib/auth/membership"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import type { PortalClass } from "@/lib/auth/membership"

// ── Portal-class default destinations ────────────────────────────────────────
const PORTAL_DEFAULTS: Record<PortalClass, string> = {
  agent:    "/dashboard",
  tenant:   "/tenant/dashboard",
  landlord: "/landlord/dashboard",
  supplier: "/supplier/dashboard",
}

// ── Allowed route prefixes per portal class ───────────────────────────────────
// Used to validate ?redirect= against the user's actual class (D-AUTH-RESOLVER-12).
const PORTAL_PREFIXES: Record<PortalClass, string[]> = {
  agent:    [
    "/dashboard", "/settings", "/properties", "/tenants", "/landlords",
    "/leases", "/applications", "/billing", "/finance", "/suppliers",
    "/maintenance", "/inspections", "/calendar", "/reports", "/documents",
    "/hoa", "/managing-schemes", "/utilities", "/statements",
  ],
  tenant:   ["/tenant"],
  landlord: ["/landlord"],
  supplier: ["/supplier"],
}

function canAccessPath(portalClass: PortalClass, path: string): boolean {
  return PORTAL_PREFIXES[portalClass].some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  )
}

// ── Audit logging ─────────────────────────────────────────────────────────────
async function logResolverDecision(opts: {
  userId: string
  orgId: string | null
  state: string
  destination: string
  redirectParamPresent: boolean
  redirectParamHonoured: boolean
  host: string
}) {
  try {
    const service = await createServiceClient()
    await service.from("auth_events").insert({
      user_id:  opts.userId,
      org_id:   opts.orgId,
      event_type: "resolver_decision",
      metadata: {
        state:                   opts.state,
        destination:             opts.destination,
        redirect_param_present:  opts.redirectParamPresent,
        redirect_param_honoured: opts.redirectParamHonoured,
        host:                    opts.host,
      },
    })
  } catch {
    // Non-fatal — log failure should never break the redirect
  }
}

// ── Main resolver ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams, origin, host } = new URL(request.url)
  const redirectParam = searchParams.get("redirect")
  const safeNext = redirectParam ? safeRedirect(redirectParam) : null

  // ── Step 0: Check session ─────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL(`${origin}/login`)
    if (safeNext) loginUrl.searchParams.set("redirect", safeNext)
    return NextResponse.redirect(loginUrl)
  }

  // ── Step 1: Check AAL (MFA elevation) ────────────────────────────────────
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (
    aalData?.currentLevel === "aal1" &&
    aalData?.nextLevel === "aal2"
  ) {
    // Check that user actually has at least one enrolled factor — otherwise
    // nextLevel === aal2 but there is nothing to challenge against.
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasVerifiedFactor = (factors?.totp ?? []).some((f) => f.status === "verified")

    if (hasVerifiedFactor) {
      // Build redirect param that points back to this resolver (preserving original redirect)
      const resolverUrl = new URL(`${origin}/auth/resolver`)
      if (safeNext) resolverUrl.searchParams.set("redirect", safeNext)
      const mfaUrl = new URL(`${origin}/login/mfa`)
      mfaUrl.searchParams.set("redirect", resolverUrl.pathname + resolverUrl.search)

      await logResolverDecision({
        userId: user.id, orgId: null, state: "authenticated",
        destination: mfaUrl.pathname, redirectParamPresent: !!redirectParam,
        redirectParamHonoured: false, host,
      })
      return NextResponse.redirect(mfaUrl)
    }
  }

  // ── Step 2: Resolve membership ────────────────────────────────────────────
  let membership
  try {
    membership = await resolveUserMembership(user.id)
  } catch (err) {
    if (err instanceof SovereignMembershipViolation) {
      // Defence-in-depth catch — Postgres trigger should have prevented this.
      // Route to onboarding/severed so the user can contact support.
      await logResolverDecision({
        userId: user.id, orgId: null, state: "sovereignty_violation",
        destination: "/onboarding/severed", redirectParamPresent: !!redirectParam,
        redirectParamHonoured: false, host,
      })
      return NextResponse.redirect(new URL(`${origin}/onboarding/severed`))
    }
    // Unexpected error — route to onboarding safely
    return NextResponse.redirect(new URL(`${origin}/onboarding`))
  }

  if (!membership) {
    // No active membership — check onboarding_state for context
    const service = await createServiceClient()
    const { data: profile } = await service
      .from("user_profiles")
      .select("onboarding_state")
      .eq("id", user.id)
      .maybeSingle()

    const state = profile?.onboarding_state as string | null | undefined
    const destination = state === "complete" ? "/onboarding/severed" : "/onboarding"

    await logResolverDecision({
      userId: user.id, orgId: null, state: "no_membership",
      destination, redirectParamPresent: !!redirectParam,
      redirectParamHonoured: false, host,
    })
    return NextResponse.redirect(new URL(`${origin}${destination}`))
  }

  // ── Step 3: Consent gate check ────────────────────────────────────────────
  // Read accepted versions from cookies. If outdated, append ?pending_consent=1
  // to the destination URL — the layout mounts ConsentGateModal on that param.
  const tosAccepted     = request.cookies.get("pleks_tos_version")?.value
  const privacyAccepted = request.cookies.get("pleks_privacy_version")?.value
  const consentPending  =
    tosAccepted !== LEGAL_VERSIONS.terms ||
    privacyAccepted !== LEGAL_VERSIONS.privacy

  // ── Steps 4 + 5: Redirect to destination ─────────────────────────────────
  const defaultDest = PORTAL_DEFAULTS[membership.portalClass]

  let destination: string
  let redirectHonoured = false

  if (safeNext && canAccessPath(membership.portalClass, safeNext)) {
    destination = safeNext
    redirectHonoured = true
  } else {
    destination = defaultDest
  }

  const destUrl = new URL(`${origin}${destination}`)
  if (consentPending) destUrl.searchParams.set("pending_consent", "1")

  await logResolverDecision({
    userId: user.id, orgId: membership.orgId, state: "authorised",
    destination, redirectParamPresent: !!redirectParam,
    redirectParamHonoured: redirectHonoured, host,
  })

  return NextResponse.redirect(destUrl)
}
