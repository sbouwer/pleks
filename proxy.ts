import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServiceClient } from "@/lib/supabase/server"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { ROUTE_MANIFEST, AGENT_ROLES, type SessionRole } from "@/lib/routing/manifest"
import type { User } from "@supabase/supabase-js"

// ── Bypass lists (checked before manifest) ───────────────────────────────────
const WEBHOOK_PREFIXES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/admin"]

// ── Manifest lookup — longest prefix wins ────────────────────────────────────
function matchManifest(pathname: string) {
  let best: string | null = null
  for (const prefix of Object.keys(ROUTE_MANIFEST)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.length) best = prefix
    }
  }
  return best ? ROUTE_MANIFEST[best] : null
}

// ── Admin gate ───────────────────────────────────────────────────────────────
function checkAdminAuth(pathname: string, request: NextRequest): NextResponse | null {
  if (!pathname.startsWith("/admin")) return null
  if (pathname === "/admin/login") return NextResponse.next()
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || adminToken !== adminSecret)
    return NextResponse.redirect(new URL("/admin/login", request.url))
  return NextResponse.next()
}

// ── Org cookie helpers ────────────────────────────────────────────────────────
function deriveTierFromSub(sub: {
  tier: string; status: string
  trial_tier?: string | null; trial_ends_at?: string | null; trial_converted?: boolean | null
} | null | undefined): string {
  if (!sub) return "owner"
  if (sub.status === "trialing" && sub.trial_ends_at && !sub.trial_converted &&
      sub.trial_tier && new Date(sub.trial_ends_at) > new Date()) {
    return sub.trial_tier
  }
  return sub.tier ?? "owner"
}

function extractCachedOrgId(raw: string): string | null {
  try {
    return (JSON.parse(raw) as { org_id?: string }).org_id ?? null
  } catch {
    return null
  }
}

async function refreshOrgCookieParallel(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string, orgId: string, supabaseResponse: NextResponse
) {
  const [orgsRes, subRes] = await Promise.all([
    service.from("user_orgs").select("role").eq("user_id", userId).eq("org_id", orgId).is("deleted_at", null).single(),
    service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted").eq("org_id", orgId).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (orgsRes.data) {
    supabaseResponse.cookies.set("pleks_org", JSON.stringify({
      org_id: orgId, role: orgsRes.data.role, tier: deriveTierFromSub(subRes.data), user_id: userId,
    }), { ...AUTH_COOKIE_OPTS, maxAge: 300 })
  }
}

async function setOrgCookiesFromDb(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  user: User, hasOrgCookieRaw: string | undefined, supabaseResponse: NextResponse
): Promise<boolean> {
  const { data: orgs } = await service
    .from("user_orgs").select("org_id, role").eq("user_id", user.id).is("deleted_at", null).limit(1)

  if (!orgs?.length) return !hasOrgCookieRaw

  const orgId = orgs[0].org_id
  const { data: sub } = await service
    .from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle()

  supabaseResponse.cookies.set("pleks_has_org", JSON.stringify({ org_id: orgId, user_id: user.id }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
  supabaseResponse.cookies.set("pleks_org", JSON.stringify({
    org_id: orgId, role: orgs[0].role, tier: deriveTierFromSub(sub), user_id: user.id,
  }), { ...AUTH_COOKIE_OPTS, maxAge: 300 })
  return false
}

async function ensureOrgCookies(
  user: User, request: NextRequest, supabaseResponse: NextResponse
): Promise<NextResponse | null> {
  const hasOrgCookieRaw = request.cookies.get("pleks_has_org")?.value
  const orgDetailCookieRaw = request.cookies.get("pleks_org")?.value
  if (hasOrgCookieRaw && orgDetailCookieRaw) return null

  const service = await createServiceClient()
  const cachedOrgId = hasOrgCookieRaw ? extractCachedOrgId(hasOrgCookieRaw) : null

  if (cachedOrgId) {
    await refreshOrgCookieParallel(service, user.id, cachedOrgId, supabaseResponse)
    return null
  }

  const shouldRedirect = await setOrgCookiesFromDb(service, user, hasOrgCookieRaw, supabaseResponse)
  return shouldRedirect ? NextResponse.redirect(new URL("/onboarding", request.url)) : null
}

// ── Main proxy ────────────────────────────────────────────────────────────────
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Admin gate — checked before everything else
  const adminResponse = checkAdminAuth(pathname, request)
  if (adminResponse) return adminResponse

  // Webhooks / cron / waitlist / admin-API — bypass session handling entirely
  if (WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Manifest lookup
  const rule = matchManifest(pathname)

  // API routes not in manifest and unknown paths — refresh session, pass through.
  // API handlers authenticate themselves; unknown paths get Next.js 404.
  if (!rule) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  // Public route — refresh session, pass through (no user required)
  if (!rule.auth) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  // Protected route — require a valid Supabase session
  const { user, supabaseResponse } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  // Agent role enforcement — only for routes whose allowed roles are all agent roles.
  // Portal routes (tenant, landlord, supplier) enforce auth in their own layouts.
  if (rule.roles && rule.roles.every(r => (AGENT_ROLES as readonly string[]).includes(r))) {
    const raw = request.cookies.get("pleks_org")?.value
    if (raw) {
      try {
        const { role } = JSON.parse(raw) as { role?: string }
        if (role && !(rule.roles as readonly SessionRole[]).includes(role as SessionRole)) {
          return NextResponse.redirect(new URL("/login", request.url))
        }
      } catch { /* malformed cookie — let ensureOrgCookies sort it out */ }
    }
  }

  // Org cookie (skipped for portals, onboarding, and demo)
  if (!rule.skipOrgCheck) {
    const orgRedirect = await ensureOrgCookies(user, request, supabaseResponse)
    if (orgRedirect) return orgRedirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
