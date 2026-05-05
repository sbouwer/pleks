/**
 * proxy.ts — Next.js middleware: session refresh, subdomain routing, and route auth
 *
 * Auth:   Multi-gate: Supabase session refresh (all authenticated routes), HMAC
 *         admin-token for /admin/* pages and /api/admin/* API routes, manifest-driven
 *         portal-role enforcement via ROUTE_MANIFEST.
 * Notes:  WEBHOOK_PREFIXES bypass all gates — handlers must validate their own secrets.
 *         Apex domain (pleks.co.za) serves marketing; app subdomain serves the product.
 */
import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServiceClient } from "@/lib/supabase/server"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { ROUTE_MANIFEST, AGENT_ROLES, type SessionRole } from "@/lib/routing/manifest"
import { resolveHostContext } from "@/lib/routing/hostname"
import { resolveUserRoles, defaultRoleForMemberships } from "@/lib/auth/roles"
import { verifyAdminToken } from "@/lib/auth/admin-token"
import type { User } from "@supabase/supabase-js"

// ── Bypass lists (checked before manifest) ───────────────────────────────────
// /api/admin is NOT in this list — it gets its own middleware gate below.
const WEBHOOK_PREFIXES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/health", "/api/status"]

// ── Subdomain split ───────────────────────────────────────────────────────────
// In production: pleks.co.za = marketing apex, app.pleks.co.za = product.
// Paths served on the apex; all others redirect to the app subdomain.
const APEX_PREFIXES = [
  "/pricing", "/for-agents", "/for-landlords", "/early-access", "/migrate",
  "/privacy", "/terms", "/credit-check-policy", "/cookie-policy", "/paia-manual",
  "/features", "/contact", "/demo", "/marketing",
]

function isApexPath(pathname: string): boolean {
  if (pathname === "/") return true
  return APEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

const APP_HOSTNAME      = "app.pleks.co.za"
const MARKETING_HOSTNAME = "pleks.co.za"

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

// ── Admin page gate (/admin/* UI routes) ─────────────────────────────────────
async function checkAdminAuth(pathname: string, request: NextRequest): Promise<NextResponse | null> {
  if (!pathname.startsWith("/admin")) return null
  if (pathname === "/admin/login") return NextResponse.next()
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = process.env.ADMIN_SECRET
  if (!await verifyAdminToken(adminToken, adminSecret))
    return NextResponse.redirect(new URL("/admin/login", request.url))
  return NextResponse.next()
}

// ── Admin API gate (/api/admin/* routes) ─────────────────────────────────────
// Defense-in-depth: individual handlers also call verifyAdmin(), but this gate
// ensures a handler that forgets the check is still blocked at the proxy level.
// Exemption: /api/admin/auth is the login endpoint itself — it can't require a
// valid token to be reachable, otherwise nobody could ever log in (chicken-and-egg).
// The route's POST handler does its own raw-secret check.
async function checkAdminApiAuth(pathname: string, request: NextRequest): Promise<NextResponse | null> {
  if (!pathname.startsWith("/api/admin")) return null
  if (pathname === "/api/admin/auth") return null
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = process.env.ADMIN_SECRET
  if (!await verifyAdminToken(adminToken, adminSecret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
  const [orgsRes, subRes, orgRes] = await Promise.all([
    service.from("user_orgs").select("role").eq("user_id", userId).eq("org_id", orgId).is("deleted_at", null).single(),
    service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted").eq("org_id", orgId).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("organisations").select("type, name").eq("id", orgId).single(),
  ])
  if (orgsRes.data) {
    supabaseResponse.cookies.set("pleks_org", JSON.stringify({
      org_id: orgId, role: orgsRes.data.role, tier: deriveTierFromSub(subRes.data),
      type: orgRes.data?.type ?? "agency", name: orgRes.data?.name ?? "",
      user_id: userId,
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
  const [subData, orgData] = await Promise.all([
    service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted")
      .eq("org_id", orgId).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("organisations").select("type, name").eq("id", orgId).single(),
  ])

  supabaseResponse.cookies.set("pleks_has_org", JSON.stringify({ org_id: orgId, user_id: user.id }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
  supabaseResponse.cookies.set("pleks_org", JSON.stringify({
    org_id: orgId, role: orgs[0].role, tier: deriveTierFromSub(subData.data),
    type: orgData.data?.type ?? "agency", name: orgData.data?.name ?? "",
    user_id: user.id,
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

// ── Portal role gate (ADDENDUM_61B) ──────────────────────────────────────────
// Enforced when the route has any non-agent role in its allowed list.
// Reads pleks_active_role; if missing, resolves from DB and sets cookie.
async function checkPortalRoleGate(
  rule: NonNullable<ReturnType<typeof matchManifest>>,
  user: User,
  request: NextRequest,
  supabaseResponse: NextResponse
): Promise<NextResponse | null> {
  if (!rule.roles) return null
  const hasPortalRole = rule.roles.some(r => !(AGENT_ROLES as readonly string[]).includes(r))
  if (!hasPortalRole) return null

  const raw = request.cookies.get("pleks_active_role")?.value
  if (raw) {
    try {
      const { role } = JSON.parse(raw) as { role?: string }
      if (role && rule.roles.includes(role as SessionRole)) return null // active role matches
      if (role) return NextResponse.redirect(new URL("/403", request.url))
    } catch { /* fall through to DB resolution */ }
  }

  // Cookie missing or unparseable — resolve from DB
  const memberships = await resolveUserRoles(user.id)
  if (memberships.length === 0) {
    return NextResponse.redirect(new URL("/onboarding", request.url))
  }

  const chosen = defaultRoleForMemberships(memberships)

  if (chosen) {
    // Auto-resolve: set cookie and check if it matches this route
    supabaseResponse.cookies.set("pleks_active_role", JSON.stringify({
      role: chosen.role, scope_id: chosen.scope_id, org_id: chosen.org_id,
    }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    supabaseResponse.cookies.set("pleks_available_roles", JSON.stringify(memberships), {
      ...AUTH_COOKIE_OPTS, maxAge: 60 * 5,
    })
    if (rule.roles.includes(chosen.role)) return null // matches — allow through
    return NextResponse.redirect(new URL("/403", request.url))
  }

  // Multiple roles, none auto-selected — send to role selector
  supabaseResponse.cookies.set("pleks_available_roles", JSON.stringify(memberships), {
    ...AUTH_COOKIE_OPTS, maxAge: 60 * 5,
  })
  return NextResponse.redirect(new URL("/select-role", request.url))
}

// ── Agent role gate ───────────────────────────────────────────────────────────
// Only enforced when all allowed roles are agent roles.
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
  const { user, supabaseResponse, aal } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // AAL2 enforcement — agent workspace routes require a completed MFA session.
  // /settings is intentionally excluded so agents can enrol their first TOTP factor.
  if (rule.requiresAal2 && aal !== "aal2") {
    const url = request.nextUrl.clone()
    url.pathname = "/login/mfa"
    url.searchParams.set("redirect", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  const portalRedirect = await checkPortalRoleGate(rule, user, request, supabaseResponse)
  if (portalRedirect) return portalRedirect

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

  // Webhooks / cron / waitlist — bypass everything
  if (WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Admin API gate — defense-in-depth before individual handler auth checks
  const adminApiResponse = await checkAdminApiAuth(pathname, request)
  if (adminApiResponse) return adminApiResponse

  // Production subdomain split
  const host = request.headers.get("host") ?? ""
  const hostCtx = resolveHostContext(host)

  // pleks.co.za + app path → app.pleks.co.za
  if (hostCtx === "marketing" && !isApexPath(pathname)) {
    const dest = request.nextUrl.clone()
    dest.host = APP_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }

  // app.pleks.co.za + marketing path → pleks.co.za
  if (hostCtx === "app" && isApexPath(pathname)) {
    const dest = request.nextUrl.clone()
    dest.host = MARKETING_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }

  // Admin UI gate (only reached on app subdomain in production)
  const adminResponse = await checkAdminAuth(pathname, request)
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

// Matcher must be a literal string (or array of literals). Next.js 16 statically
// analyzes the matcher value and rejects non-literal AST nodes (like String.raw
// tagged templates) with "Invalid segment configuration export detected" — even
// though the runtime value is a valid regex string. Backslashes for regex escapes
// must be doubled here since this is a normal string literal, not a raw one.
export const config = {
  matcher: "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
}
