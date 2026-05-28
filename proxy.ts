/**
 * proxy.ts — Next.js middleware: session refresh, subdomain routing, and route auth
 *
 * Auth:   Multi-gate: Supabase session refresh (all authenticated routes), HMAC
 *         admin-token for /admin/* pages and /api/admin/* API routes, manifest-driven
 *         portal-role enforcement via ROUTE_MANIFEST.
 * Notes:  WEBHOOK_PREFIXES bypass all gates — handlers must validate their own secrets.
 *         Apex domain (pleks.co.za) serves marketing; app subdomain serves the product.
 *         ensureOrgCookies() now calls resolveUserMembership() for all portal classes
 *         (not just user_orgs). ToS/Privacy consent is now handled via ConsentGateModal
 *         mounted in destination layouts — no redirect to /accept-terms.
 */
import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServiceClient } from "@/lib/supabase/server"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { ROUTE_MANIFEST } from "@/lib/routing/manifest"
import { resolveHostContext } from "@/lib/routing/hostname"
import { resolveUserMembership } from "@/lib/auth/membership"
import { verifyAdminToken } from "@/lib/auth/admin-token"
import { collectGateFacts } from "@/lib/auth/facts"
import { routeGateDecision } from "@/lib/auth/decisions"
import type { User } from "@supabase/supabase-js"

// ── Bypass lists (checked before manifest) ───────────────────────────────────
const WEBHOOK_PREFIXES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/health", "/api/status", "/api/legal"]

// ── Subdomain split ───────────────────────────────────────────────────────────
const APEX_PREFIXES = [
  "/pricing",
  "/privacy", "/terms", "/credit-check-policy", "/cookie-policy", "/paia-manual",
  "/popia-register", "/definitions", "/contact", "/demo", "/marketing",
  "/api/paia-manual-pdf",
]

function isApexPath(pathname: string): boolean {
  if (pathname === "/") return true
  return APEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

const APP_HOSTNAME       = "app.pleks.co.za"
const MARKETING_HOSTNAME = "pleks.co.za"
const ADMIN_HOSTNAME     = "admin.pleks.co.za"
const STATUS_HOSTNAME    = "status.pleks.co.za"

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin"     || pathname.startsWith("/admin/") ||
         pathname === "/api/admin" || pathname.startsWith("/api/admin/")
}

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
async function checkAdminApiAuth(pathname: string, request: NextRequest): Promise<NextResponse | null> {
  if (!pathname.startsWith("/api/admin")) return null
  if (pathname === "/api/admin/auth") return null
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = process.env.ADMIN_SECRET
  if (!await verifyAdminToken(adminToken, adminSecret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.next()
}

// ── Resolver redirect helper ──────────────────────────────────────────────────
// Always carries ?redirect=<pathname> so resolver can route back to the correct
// destination after MFA enrolment, org-cookie hydration, or role resolution.
function resolverRedirect(request: NextRequest): NextResponse {
  const url = new URL("/auth/resolver", request.url)
  url.searchParams.set("redirect", request.nextUrl.pathname)
  return NextResponse.redirect(url)
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
    service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted").eq("org_id", orgId).not("status", "eq", "purged").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("organisations").select("type, name").eq("id", orgId).single(),
  ])
  if (orgsRes.data) {
    supabaseResponse.cookies.set("pleks_org", JSON.stringify({
      org_id: orgId, role: orgsRes.data.role, tier: deriveTierFromSub(subRes.data),
      type: orgRes.data?.type ?? "agency", name: orgRes.data?.name ?? "",
      sub_status: subRes.data?.status ?? null,
      user_id: userId,
    }), { ...AUTH_COOKIE_OPTS, maxAge: 300 })
  }
}

/**
 * Hydrate org cookies from the database.
 * Uses resolveUserMembership() so all portal classes (not just agent) get cookies set.
 * When no membership is found, delegates to /auth/resolver instead of /onboarding
 * directly — the resolver decides the correct state-based destination.
 */
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

  // No cached org — resolve membership across all classes
  let membership
  try {
    membership = await resolveUserMembership(user.id)
  } catch {
    // SovereignMembershipViolation or unexpected error — send to resolver to handle
    return resolverRedirect(request)
  }

  if (!membership) {
    // No membership anywhere — resolver decides whether to send to /onboarding
    return resolverRedirect(request)
  }

  // For agent-class: write pleks_org + pleks_has_org as before
  if (membership.portalClass === "agent") {
    const [subData, orgData] = await Promise.all([
      service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted")
        .eq("org_id", membership.orgId).not("status", "eq", "purged")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("organisations").select("type, name").eq("id", membership.orgId).single(),
    ])

    supabaseResponse.cookies.set("pleks_has_org", JSON.stringify({ org_id: membership.orgId, user_id: user.id }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    supabaseResponse.cookies.set("pleks_org", JSON.stringify({
      org_id: membership.orgId, role: membership.orgRole, tier: deriveTierFromSub(subData.data),
      type: orgData.data?.type ?? "agency", name: orgData.data?.name ?? "",
      sub_status: subData.data?.status ?? null,
      user_id: user.id,
    }), { ...AUTH_COOKIE_OPTS, maxAge: 300 })
  } else {
    // Non-agent portals: write a slim pleks_has_org to suppress future DB calls
    // but leave pleks_org absent (portal routes don't gate on pleks_org content)
    supabaseResponse.cookies.set("pleks_has_org", JSON.stringify({
      org_id: membership.orgId, user_id: user.id, portal_class: membership.portalClass,
    }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
  }

  return null
}

// ── Protected-route handler ───────────────────────────────────────────────────
// collect → decide → execute. No policy in this handler.
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

  // Hydrate org cookies before fact collection so the gate can read them.
  // ensureOrgCookies sets cookies on supabaseResponse (browser-side); they are
  // not yet in request.cookies on this request — gate falls through to resolver
  // on the first hit, which is the correct fail-closed behaviour.
  if (!rule.skipOrgCheck) {
    const orgRedirect = await ensureOrgCookies(user, request, supabaseResponse)
    if (orgRedirect) return orgRedirect
  }

  const facts   = collectGateFacts(request, rule, { isAuthenticated: true, aal })
  const outcome = routeGateDecision(facts)

  switch (outcome.action) {
    case "allow":
      return supabaseResponse
    case "to_login": {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("redirect", request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
    case "to_resolver":
      return resolverRedirect(request)
    case "forbidden":
      return NextResponse.redirect(new URL("/403", request.url))
  }
}

// ── Subdomain split (production only) ────────────────────────────────────────
function handleStatusSubdomain(pathname: string, request: NextRequest): NextResponse {
  if (pathname === "/") {
    const dest = request.nextUrl.clone(); dest.pathname = "/status"
    return NextResponse.rewrite(dest)
  }
  const dest = request.nextUrl.clone()
  dest.host = isApexPath(pathname) ? MARKETING_HOSTNAME : APP_HOSTNAME
  return NextResponse.redirect(dest, 308)
}

async function handleSubdomainSplit(
  hostCtx: ReturnType<typeof resolveHostContext>,
  pathname: string,
  request: NextRequest,
): Promise<NextResponse | null> {
  if (hostCtx === "marketing" && !isApexPath(pathname)) {
    const dest = request.nextUrl.clone()
    if (pathname === "/status" || pathname.startsWith("/status/")) {
      dest.host = STATUS_HOSTNAME; dest.pathname = "/"
      return NextResponse.redirect(dest, 308)
    }
    dest.host = APP_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }
  if (hostCtx === "app" && isApexPath(pathname)) {
    const dest = request.nextUrl.clone(); dest.host = MARKETING_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }
  if ((hostCtx === "app" || hostCtx === "marketing") && isAdminPath(pathname)) {
    const dest = request.nextUrl.clone(); dest.host = ADMIN_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }
  if (hostCtx === "admin" && !isAdminPath(pathname)) {
    const dest = request.nextUrl.clone(); dest.host = APP_HOSTNAME
    return NextResponse.redirect(dest, 308)
  }
  if (hostCtx === "status") return handleStatusSubdomain(pathname, request)
  if (pathname === "/status" || pathname.startsWith("/status/")) {
    const dest = request.nextUrl.clone(); dest.host = STATUS_HOSTNAME; dest.pathname = "/"
    return NextResponse.redirect(dest, 308)
  }
  if (hostCtx === "admin") {
    const adminResponse = await checkAdminAuth(pathname, request)
    if (adminResponse) return adminResponse
    return NextResponse.next()
  }
  return null
}

// ── Main proxy ────────────────────────────────────────────────────────────────
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const adminApiResponse = await checkAdminApiAuth(pathname, request)
  if (adminApiResponse) return adminApiResponse

  const host = request.headers.get("host") ?? ""
  const hostCtx = resolveHostContext(host)
  const isProdLive = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production"

  if (isProdLive) {
    const splitResponse = await handleSubdomainSplit(hostCtx, pathname, request)
    if (splitResponse) return splitResponse
  }

  const rule = matchManifest(pathname)

  if (!rule?.auth) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  return handleProtectedRoute(rule, request)
}

export const config = {
  matcher: "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
}
