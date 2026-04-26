import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServiceClient } from "@/lib/supabase/server"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { ROUTE_MANIFEST, AGENT_ROLES, type SessionRole } from "@/lib/routing/manifest"
import { resolveHostContext } from "@/lib/routing/hostname"
import type { User } from "@supabase/supabase-js"

// ── Bypass lists (checked before manifest) ───────────────────────────────────
const WEBHOOK_PREFIXES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/admin"]

// ── Subdomain split ───────────────────────────────────────────────────────────
// In production: pleks.co.za = marketing apex, app.pleks.co.za = product.
// Paths served on the apex; all others redirect to the app subdomain.
const APEX_PREFIXES = [
  "/pricing", "/for-agents", "/for-landlords", "/early-access", "/migrate",
  "/privacy", "/terms", "/credit-check-policy", "/contact", "/status",
  "/demo", "/marketing",
]

function isApexPath(pathname: string): boolean {
  if (pathname === "/") return true
  return APEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

const APP_HOSTNAME = "app.pleks.co.za"

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

// ── Agent role gate ───────────────────────────────────────────────────────────
// Only enforced when all allowed roles are agent roles; portal layouts handle
// portal-role enforcement themselves.
function checkAgentRoleGate(
  rule: NonNullable<ReturnType<typeof matchManifest>>,
  request: NextRequest
): NextResponse | null {
  if (!rule.roles) return null
  if (!rule.roles.every(r => (AGENT_ROLES as readonly string[]).includes(r))) return null

  const raw = request.cookies.get("pleks_org")?.value
  if (!raw) return null

  try {
    const { role } = JSON.parse(raw) as { role?: string }
    if (role && !rule.roles.includes(role as SessionRole)) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
  } catch { /* malformed cookie — ensureOrgCookies will redirect */ }
  return null
}

// ── Protected-route handler ───────────────────────────────────────────────────
async function handleProtectedRoute(
  rule: NonNullable<ReturnType<typeof matchManifest>>,
  request: NextRequest
): Promise<NextResponse> {
  const { user, supabaseResponse } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  const roleRedirect = checkAgentRoleGate(rule, request)
  if (roleRedirect) return roleRedirect

  if (!rule.skipOrgCheck) {
    const orgRedirect = await ensureOrgCookies(user, request, supabaseResponse)
    if (orgRedirect) return orgRedirect
  }

  return supabaseResponse
}

// ── Main proxy ────────────────────────────────────────────────────────────────
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Webhooks / cron / waitlist / admin-API — bypass everything
  if (WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Production subdomain split: non-marketing paths on the apex redirect to app.pleks.co.za
  const host = request.headers.get("host") ?? ""
  if (resolveHostContext(host) === "marketing" && !isApexPath(pathname)) {
    const dest = request.nextUrl.clone()
    dest.host = APP_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }

  // Admin gate (only reached on app subdomain in production)
  const adminResponse = checkAdminAuth(pathname, request)
  if (adminResponse) return adminResponse

  // Manifest lookup
  const rule = matchManifest(pathname)

  // No manifest entry (API self-auth or unknown path) or public route — refresh session + pass through
  if (!rule?.auth) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  return handleProtectedRoute(rule, request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
