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
import { resolveHostContext } from "@/lib/routing/hostname"
import {
  isWebhookPath, isApexPath, isAdminPath, matchManifest, deriveTierFromSub,
  orgCookieHasRole, extractCachedOrgId, cookieUserId,
} from "@/lib/routing/gate"
import { resolveUserMembership } from "@/lib/auth/membership"
import { verifyAdminToken } from "@/lib/auth/admin-token"
import { collectGateFacts } from "@/lib/auth/facts"
import { routeGateDecision } from "@/lib/auth/decisions"
import type { User } from "@supabase/supabase-js"
import { isProductionNode, isProductionRuntime, optionalEnv } from "@/lib/env"

// ── Bypass lists (checked before manifest) ───────────────────────────────────
// Bypass lists + apex/admin path predicates live in lib/routing/gate.ts (pure + unit-tested).

// ── Subdomain split ───────────────────────────────────────────────────────────
const APP_HOSTNAME       = "app.pleks.co.za"
// Canonical marketing host — Vercel 308-redirects bare pleks.co.za → www at the
// infrastructure level. Point at www to avoid an extra redirect hop on every
// cross-subdomain bounce. Do NOT add a www→bare redirect here (recreates a loop).
const MARKETING_HOSTNAME = "www.pleks.co.za"
const ADMIN_HOSTNAME     = "admin.pleks.co.za"
const STATUS_HOSTNAME    = "status.pleks.co.za"

// ── Admin page gate (/admin/* UI routes) ─────────────────────────────────────
async function checkAdminAuth(pathname: string, request: NextRequest): Promise<NextResponse | null> {
  if (!pathname.startsWith("/admin")) return null
  if (pathname === "/admin/login") return NextResponse.next()
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = optionalEnv("ADMIN_SECRET")
  if (!await verifyAdminToken(adminToken, adminSecret))
    return NextResponse.redirect(new URL("/admin/login", request.url))
  return NextResponse.next()
}

// ── Admin API gate (/api/admin/* routes) ─────────────────────────────────────
async function checkAdminApiAuth(pathname: string, request: NextRequest): Promise<NextResponse | null> {
  if (!pathname.startsWith("/api/admin")) return null
  if (pathname === "/api/admin/auth") return null
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = optionalEnv("ADMIN_SECRET")
  if (!await verifyAdminToken(adminToken, adminSecret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.next()
}

// Copy any cookies set on `from` (the supabaseResponse — refreshed session token,
// freshly-hydrated pleks_org/pleks_has_org) onto a redirect response. Without this,
// NextResponse.redirect() drops those Set-Cookie headers and the next request is
// identical → infinite gate↔resolver loop (the @supabase/ssr redirect gotcha).
function carryCookies(redirect: NextResponse, from?: NextResponse): NextResponse {
  if (from) for (const c of from.cookies.getAll()) redirect.cookies.set(c)
  return redirect
}

// ── Resolver redirect helper ──────────────────────────────────────────────────
// Always carries ?redirect=<pathname> so resolver can route back to the correct
// destination after MFA enrolment, org-cookie hydration, or role resolution.
function resolverRedirect(request: NextRequest, from?: NextResponse): NextResponse {
  const url = new URL("/auth/resolver", request.url)
  url.searchParams.set("redirect", request.nextUrl.pathname)
  return carryCookies(NextResponse.redirect(url), from)
}

// ── Loop-breaker + structured gate logging ────────────────────────────────────
// Auth loops historically surfaced only as opaque ERR_TOO_MANY_REDIRECTS. The
// counter cookie turns a runaway gate↔resolver cycle into a graceful, logged
// failure; the structured log line surfaces the exact route + facts in Vercel
// runtime logs and the local terminal so a loop is diagnosable at a glance.
const LOOP_LIMIT = 4
const RDR_COOKIE = "pleks_rdr"
const TRACE_COOKIE = "pleks_trace"

function readRdr(request: NextRequest): number {
  const n = Number.parseInt(request.cookies.get(RDR_COOKIE)?.value ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Correlated tracing: one short-lived id shared across a gate→resolver→gate hop chain.
// Re-read the existing cookie (within its 30s window) so every bounce of a single loop
// logs the SAME trace — that's what makes a loop greppable end-to-end across both the
// [gate] (proxy) and [resolver] (route handler) log lines. Mint a fresh one otherwise.
function readOrMintTrace(request: NextRequest): string {
  const existing = request.cookies.get(TRACE_COOKIE)?.value
  if (existing && /^[a-z0-9]{8}$/.test(existing)) return existing
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8)
}

function logGate(
  request: NextRequest,
  facts: ReturnType<typeof collectGateFacts>,
  action: string,
  rdr: number,
  trace: string,
): void {
  // PII-free: path + decision drivers only, never email/token.
  console.warn("[gate] " + JSON.stringify({
    trace,
    path:         request.nextUrl.pathname,
    authed:       facts.isAuthenticated,
    aal:          facts.assurance.current,
    role:         facts.membership.sessionRole ?? null,
    hasOrg:       facts.membership.exists,
    requiresAal2: facts.route.requiresAal2,
    roleGated:    !!(facts.route.allowedRoles && facts.route.allowedRoles.length),
    action,
    rdr,
  }))
}

// ── Org cookie helpers ────────────────────────────────────────────────────────
async function refreshOrgCookieParallel(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string, orgId: string, request: NextRequest, supabaseResponse: NextResponse
) {
  const [orgsRes, subRes, orgRes] = await Promise.all([
    service.from("user_orgs").select("role").eq("user_id", userId).eq("org_id", orgId).is("deleted_at", null).single(),
    service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted").eq("org_id", orgId).not("status", "eq", "purged").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("organisations").select("type, name").eq("id", orgId).single(),
  ])
  if (orgsRes.data) {
    const orgValue = JSON.stringify({
      org_id: orgId, role: orgsRes.data.role, tier: deriveTierFromSub(subRes.data),
      type: orgRes.data?.type ?? "agency", name: orgRes.data?.name ?? "",
      sub_status: subRes.data?.status ?? null,
      user_id: userId,
    })
    supabaseResponse.cookies.set("pleks_org", orgValue, { ...AUTH_COOKIE_OPTS, maxAge: 300 })
    request.cookies.set("pleks_org", orgValue)

    // Durable role: pleks_org expires after 300s, but the 7-day pleks_has_org carries the
    // role too so the gate can still admit role-gated routes after pleks_org lapses mid-flow
    // (welcome→enrol→verify can exceed 300s). collectGateFacts falls back to this. Loop-class fix.
    const hasOrgValue = JSON.stringify({
      org_id: orgId, user_id: userId, role: orgsRes.data.role, portal_class: "agent",
    })
    supabaseResponse.cookies.set("pleks_has_org", hasOrgValue, { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    request.cookies.set("pleks_has_org", hasOrgValue)
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
  const rawHasOrg = request.cookies.get("pleks_has_org")?.value
  const rawOrgDetail = request.cookies.get("pleks_org")?.value

  // Shared-desk safety: if the cached org cookies were written for a DIFFERENT user
  // (e.g. an agency shared browser where someone else was just logged in), discard
  // them and re-hydrate for the current session user — never authorise B with A's org.
  const wrongUser =
    (cookieUserId(rawHasOrg)   !== null && cookieUserId(rawHasOrg)   !== user.id) ||
    (cookieUserId(rawOrgDetail) !== null && cookieUserId(rawOrgDetail) !== user.id)
  if (wrongUser) {
    supabaseResponse.cookies.set("pleks_org", "", { path: "/", maxAge: 0 })
    supabaseResponse.cookies.set("pleks_has_org", "", { path: "/", maxAge: 0 })
    request.cookies.delete("pleks_org")
    request.cookies.delete("pleks_has_org")
  }
  const hasOrgCookieRaw    = wrongUser ? undefined : rawHasOrg
  const orgDetailCookieRaw = wrongUser ? undefined : rawOrgDetail

  // Trust the cached cookies only if pleks_org actually parses WITH a role. A stale or
  // malformed pleks_org (e.g. left over from an older format / a half-finished flow)
  // would otherwise be trusted here, leave the gate unable to read a role on a
  // role-gated route, and loop /dashboard ↔ resolver forever. If it's unusable we fall
  // through and re-hydrate from the DB below.
  if (hasOrgCookieRaw && orgDetailCookieRaw && orgCookieHasRole(orgDetailCookieRaw)) return null

  const service = await createServiceClient()
  const cachedOrgId = hasOrgCookieRaw ? extractCachedOrgId(hasOrgCookieRaw) : null

  if (cachedOrgId) {
    await refreshOrgCookieParallel(service, user.id, cachedOrgId, request, supabaseResponse)
    return null
  }

  // No cached org — resolve membership across all classes
  let membership
  try {
    membership = await resolveUserMembership(user.id)
  } catch {
    // SovereignMembershipViolation or unexpected error — send to resolver to handle
    return resolverRedirect(request, supabaseResponse)
  }

  if (!membership) {
    // No membership anywhere — resolver decides whether to send to /onboarding
    return resolverRedirect(request, supabaseResponse)
  }

  // For agent-class: write pleks_org + pleks_has_org as before
  if (membership.portalClass === "agent") {
    const [subData, orgData] = await Promise.all([
      service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted")
        .eq("org_id", membership.orgId).not("status", "eq", "purged")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("organisations").select("type, name").eq("id", membership.orgId).single(),
    ])

    const hasOrgValue = JSON.stringify({
      org_id: membership.orgId, user_id: user.id, role: membership.orgRole, portal_class: "agent",
    })
    const orgValue    = JSON.stringify({
      org_id: membership.orgId, role: membership.orgRole, tier: deriveTierFromSub(subData.data),
      type: orgData.data?.type ?? "agency", name: orgData.data?.name ?? "",
      sub_status: subData.data?.status ?? null,
      user_id: user.id,
    })
    supabaseResponse.cookies.set("pleks_has_org", hasOrgValue, { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    supabaseResponse.cookies.set("pleks_org", orgValue, { ...AUTH_COOKIE_OPTS, maxAge: 300 })
    request.cookies.set("pleks_has_org", hasOrgValue)
    request.cookies.set("pleks_org", orgValue)
  } else {
    // Non-agent portals: write a slim pleks_has_org to suppress future DB calls
    // but leave pleks_org absent (portal routes don't gate on pleks_org content)
    const hasOrgValue = JSON.stringify({
      org_id: membership.orgId, user_id: user.id, portal_class: membership.portalClass,
    })
    supabaseResponse.cookies.set("pleks_has_org", hasOrgValue, { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    request.cookies.set("pleks_has_org", hasOrgValue)
  }

  return null
}

// Stamp the correlation id onto a response so the next hop reuses the same trace.
function stampTrace(res: NextResponse, trace: string): NextResponse {
  res.cookies.set(TRACE_COOKIE, trace, { path: "/", maxAge: 30 })
  return res
}

// ── Protected-route handler ───────────────────────────────────────────────────
// collect → decide → execute. No policy in this handler.
async function handleProtectedRoute(
  rule: NonNullable<ReturnType<typeof matchManifest>>,
  request: NextRequest,
  trace: string,
): Promise<NextResponse> {
  const { user, supabaseResponse, aal } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", request.nextUrl.pathname)
    return stampTrace(carryCookies(NextResponse.redirect(url), supabaseResponse), trace)
  }

  // Hydrate org cookies before fact collection so the gate can read them.
  // ensureOrgCookies writes pleks_org/pleks_has_org to BOTH request.cookies (so the
  // gate reads the role this same request) and supabaseResponse (so the browser keeps
  // them). Every redirect below carries supabaseResponse's cookies so the refreshed
  // session + org cookie persist — otherwise the next request repeats and loops.
  if (!rule.skipOrgCheck) {
    const orgRedirect = await ensureOrgCookies(user, request, supabaseResponse)
    if (orgRedirect) return stampTrace(orgRedirect, trace)
  }

  const facts   = collectGateFacts(request, rule, { isAuthenticated: true, aal })
  const outcome = routeGateDecision(facts)
  const rdr     = readRdr(request)

  if (outcome.action !== "allow") logGate(request, facts, outcome.action, rdr, trace)

  switch (outcome.action) {
    case "allow": {
      // Clear the loop counter on any successful pass-through.
      if (rdr > 0) supabaseResponse.cookies.set(RDR_COOKIE, "", { path: "/", maxAge: 0 })
      return stampTrace(supabaseResponse, trace)
    }
    case "to_login": {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("redirect", request.nextUrl.pathname)
      const res = carryCookies(NextResponse.redirect(url), supabaseResponse)
      res.cookies.set(RDR_COOKIE, "", { path: "/", maxAge: 0 })
      return stampTrace(res, trace)
    }
    case "to_resolver": {
      // Loop-breaker: too many consecutive gate→resolver bounces means the resolver
      // keeps sending the user to a route the gate keeps rejecting (e.g. a role the
      // gate can't read). Stop looping — send to /login with a diagnostic instead.
      if (rdr >= LOOP_LIMIT) {
        console.error("[gate] redirect loop broken after " + rdr + " bounces — sending to /login", JSON.stringify({
          trace,
          path: request.nextUrl.pathname, aal: facts.assurance.current,
          role: facts.membership.sessionRole ?? null, hasOrg: facts.membership.exists,
        }))
        const url = request.nextUrl.clone()
        url.pathname = "/login"
        url.search = ""
        url.searchParams.set("err", "loop")
        const res = carryCookies(NextResponse.redirect(url), supabaseResponse)
        // Purge the loop counter + the (httpOnly) org cookies so the user gets a clean
        // slate — a poisoned pleks_org can't be cleared client-side.
        res.cookies.set(RDR_COOKIE, "", { path: "/", maxAge: 0 })
        res.cookies.set("pleks_org", "", { path: "/", maxAge: 0 })
        res.cookies.set("pleks_has_org", "", { path: "/", maxAge: 0 })
        return stampTrace(res, trace)
      }
      const res = resolverRedirect(request, supabaseResponse)
      res.cookies.set(RDR_COOKIE, String(rdr + 1), { path: "/", maxAge: 15 })
      return stampTrace(res, trace)
    }
    case "forbidden":
      return stampTrace(carryCookies(NextResponse.redirect(new URL("/403", request.url)), supabaseResponse), trace)
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
  // API routes are one deployment — serve them same-origin on whatever host calls
  // them. Redirecting (e.g. www → app) turns a fetch() cross-origin and CORS-fails.
  // Admin/webhook/cron APIs are already handled before this in the main proxy.
  if (pathname.startsWith("/api/")) return null

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
    // Redirect to /admin on the same subdomain — bouncing to APP_HOSTNAME would
    // chain into the apex redirect (app → pleks.co.za) and land on marketing.
    const dest = request.nextUrl.clone(); dest.pathname = "/admin"
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

  if (isWebhookPath(pathname)) return NextResponse.next()

  const adminApiResponse = await checkAdminApiAuth(pathname, request)
  if (adminApiResponse) return adminApiResponse

  const host = request.headers.get("host") ?? ""
  const hostCtx = resolveHostContext(host)
  const isProdLive = isProductionNode() && isProductionRuntime()

  if (isProdLive) {
    const splitResponse = await handleSubdomainSplit(hostCtx, pathname, request)
    if (splitResponse) return splitResponse
  }

  const rule = matchManifest(pathname)

  if (!rule?.auth) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  return handleProtectedRoute(rule, request, readOrMintTrace(request))
}

export const config = {
  matcher: "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
}
