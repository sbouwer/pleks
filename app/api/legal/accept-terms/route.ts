/**
 * app/api/legal/accept-terms/route.ts — accept current ToS/Privacy from the consent-gate modal
 *
 * Route:  POST /api/legal/accept-terms
 * Auth:   self-validated (createClient().auth.getUser) — /api/legal bypasses proxy gates (WEBHOOK_PREFIXES)
 * Data:   tos_acceptances insert (recordTosAcceptance) + sets pleks_tos_version / pleks_privacy_version cookies
 * Notes:  JSON sibling of the acceptCurrentTerms server action (used by the /accept-terms page) so the
 *         ConsentGateModal can accept in place. Versions are server-authoritative (LEGAL_VERSIONS) — the
 *         posted body is ignored. Cookie = fast-path gate (proxy/facts.consentCurrent); DB row = POPIA s17.
 *         Without this route the modal POSTed to a 404, so consent never persisted and re-prompted forever.
 */
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordTosAcceptance } from "@/lib/subscriptions/acceptance"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { isProductionNode } from "@/lib/env"

const ONE_YEAR = 60 * 60 * 24 * 365

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const service = await createServiceClient()
  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)
  if (!membership) return NextResponse.json({ error: "no_org" }, { status: 400 })

  const h = await headers()
  const ip = h.get("x-forwarded-for") ?? null
  const ua = h.get("user-agent") ?? null

  await recordTosAcceptance(service, membership.org_id, user.id, user.email ?? "", ip, ua, "version_update")

  const res = NextResponse.json({ ok: true })
  res.cookies.set("pleks_tos_version", LEGAL_VERSIONS.terms, { ...AUTH_COOKIE_OPTS, maxAge: ONE_YEAR })
  // Non-httpOnly so the privacy banner client component can read it from document.cookie
  res.cookies.set("pleks_privacy_version", LEGAL_VERSIONS.privacy, {
    sameSite: "lax",
    path: "/",
    secure: isProductionNode(),
    maxAge: ONE_YEAR,
  })
  return res
}
