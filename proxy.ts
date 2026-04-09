import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServiceClient } from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"

const PUBLIC_ROUTES = ["/", "/pricing", "/login", "/forgot-password", "/reset-password",
  "/for-agents", "/for-landlords", "/early-access", "/migrate",
  "/privacy", "/terms", "/credit-check-policy",
  "/register", "/onboarding"]
const AUTH_ROUTES = ["/auth"]
const WEBHOOK_ROUTES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/admin"]

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/" }

function isPublicRoute(pathname: string) {
  return (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/")) ||
    AUTH_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/apply") || pathname.startsWith("/demo") ||
    pathname.startsWith("/api/payfast") || pathname.startsWith("/api/payments") ||
    pathname.startsWith("/api/import") || pathname.startsWith("/api/reports") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/applications/") ||
    pathname.startsWith("/api/unsubscribe") ||
    pathname.startsWith("/api/approve")
  )
}

function isOrgCheckSkipped(pathname: string) {
  return pathname.startsWith("/onboarding") || pathname.startsWith("/demo") ||
    pathname.startsWith("/contractor") || pathname.startsWith("/portal")
}

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
    const p = JSON.parse(raw) as { org_id?: string }
    return p.org_id ?? null
  } catch {
    return null // old "1" format
  }
}

function checkAdminAuth(pathname: string, request: NextRequest): NextResponse | null {
  if (!pathname.startsWith("/admin")) return null
  if (pathname === "/admin/login") return NextResponse.next()
  const adminToken = request.cookies.get("pleks_admin_token")?.value
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || adminToken !== adminSecret) return NextResponse.redirect(new URL("/admin/login", request.url))
  return NextResponse.next()
}

async function refreshOrgCookieParallel(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string, orgId: string, supabaseResponse: NextResponse
) {
  const [orgsRes, subRes] = await Promise.all([
    service.from("user_orgs").select("role").eq("user_id", userId).eq("org_id", orgId).is("deleted_at", null).single(),
    service.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted").eq("org_id", orgId).in("status", ["active", "trialing"]).single(),
  ])
  if (orgsRes.data) {
    supabaseResponse.cookies.set("pleks_org", JSON.stringify({
      org_id: orgId, role: orgsRes.data.role, tier: deriveTierFromSub(subRes.data), user_id: userId,
    }), { ...COOKIE_OPTS, maxAge: 3600 })
  }
}

async function setOrgCookiesFromDb(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  user: User, hasOrgCookieRaw: string | undefined, supabaseResponse: NextResponse
): Promise<boolean> {
  const { data: orgs } = await service
    .from("user_orgs").select("org_id, role").eq("user_id", user.id).is("deleted_at", null).limit(1)

  if (!orgs?.length) return !hasOrgCookieRaw // true = redirect to onboarding

  const orgId = orgs[0].org_id
  const { data: sub } = await service
    .from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgId).in("status", ["active", "trialing"]).single()

  supabaseResponse.cookies.set("pleks_has_org", JSON.stringify({ org_id: orgId, user_id: user.id }), { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
  supabaseResponse.cookies.set("pleks_org", JSON.stringify({
    org_id: orgId, role: orgs[0].role, tier: deriveTierFromSub(sub), user_id: user.id,
  }), { ...COOKIE_OPTS, maxAge: 3600 })
  return false
}

async function ensureOrgCookies(user: User, request: NextRequest, supabaseResponse: NextResponse): Promise<NextResponse | null> {
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const adminResponse = checkAdminAuth(pathname, request)
  if (adminResponse) return adminResponse

  if (WEBHOOK_ROUTES.some((r) => pathname.startsWith(r))) return NextResponse.next()

  if (isPublicRoute(pathname)) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  const { user, supabaseResponse } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  if (!isOrgCheckSkipped(pathname)) {
    const redirect = await ensureOrgCookies(user, request, supabaseResponse)
    if (redirect) return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
