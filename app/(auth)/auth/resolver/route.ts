/**
 * app/(auth)/auth/resolver/route.ts — singular post-authentication routing authority
 *
 * Route:  GET /auth/resolver
 *         GET /auth/resolver?redirect=<safe-path>
 * Auth:   public (issues redirects only; no UI render; resolves session internally)
 * Notes:  Implements ADDENDUM_AUTH_CONTRACT §3 decision tree.
 *         This is the ONLY route that makes role-class routing decisions (I-1).
 *         collect → decide → execute. No policy in this handler.
 *         Every decision is logged to auth_events with the full AuthFacts for replay.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { resolveAuthDestination, type AuthFacts, type Destination } from "@/lib/auth/decisions"
import { collectResolverFacts } from "@/lib/auth/facts"

// ── Destination → NextResponse ────────────────────────────────────────────────
function execute(dest: Destination, origin: string): NextResponse {
  const url = (path: string) => new URL(`${origin}${path}`)

  switch (dest.kind) {
    case "login": {
      const u = url("/login")
      if (dest.redirect) u.searchParams.set("redirect", dest.redirect)
      return NextResponse.redirect(u)
    }
    case "onboarding":
      return NextResponse.redirect(url("/onboarding"))
    case "severed":
      return NextResponse.redirect(url("/onboarding/severed"))
    case "first_login": {
      const u = url("/login/first-setup")
      if (dest.redirect) u.searchParams.set("redirect", dest.redirect)
      return NextResponse.redirect(u)
    }
    case "mfa_verify": {
      const u = url("/login/mfa")
      if (dest.redirect) u.searchParams.set("redirect", dest.redirect)
      return NextResponse.redirect(u)
    }
    case "mfa_enrol": {
      const u = url("/settings/security/enrol-totp")
      u.searchParams.set("mandatory", "true")
      if (dest.redirect) u.searchParams.set("redirect", dest.redirect)
      return NextResponse.redirect(u)
    }
    case "app": {
      const u = url(dest.path)
      if (dest.pendingConsent) u.searchParams.set("pending_consent", "1")
      return NextResponse.redirect(u)
    }
  }
}

// ── Audit log — stores full AuthFacts so any decision can be replayed ─────────
async function logResolverDecision(
  facts: AuthFacts,
  dest: Destination,
  host: string
): Promise<void> {
  try {
    const service = await createServiceClient()
    await service.from("auth_events").insert({
      org_id:     facts.membership.orgId ?? null,
      user_id:    facts.userId ?? null,
      event_type: "resolver_decision",
      metadata: { facts, dest, host },
    })
  } catch {
    // Non-fatal — log failure never breaks the redirect
  }
}

// ── Main resolver ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { origin, host } = new URL(request.url)

  const supabase = await createClient()
  const facts    = await collectResolverFacts(request, supabase)
  const dest     = resolveAuthDestination(facts)

  await logResolverDecision(facts, dest, host)

  return execute(dest, origin)
}
