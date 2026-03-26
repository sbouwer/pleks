import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServiceClient } from "@/lib/supabase/server"

const PUBLIC_ROUTES = ["/", "/pricing", "/login", "/forgot-password", "/reset-password",
  "/for-agents", "/for-landlords", "/early-access", "/migrate",
  "/privacy", "/terms", "/credit-check-policy",
  "/register", "/onboarding"]
const AUTH_ROUTES = ["/auth"]
const WEBHOOK_ROUTES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/admin"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Admin panel protection ──────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Allow /admin/login through
    if (pathname === "/admin/login") {
      return NextResponse.next()
    }
    const adminToken = request.cookies.get("pleks_admin_token")?.value
    const adminSecret = process.env.ADMIN_SECRET
    if (!adminSecret || adminToken !== adminSecret) {
      return NextResponse.redirect(new URL("/admin/login", request.url))
    }
    return NextResponse.next()
  }

  // Always allow webhooks, cron, API routes
  if (WEBHOOK_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Public routes — no auth required
  if (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/")) ||
    AUTH_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/apply") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/api/payfast") ||
    pathname.startsWith("/api/payments") ||
    pathname.startsWith("/api/import") ||
    pathname.startsWith("/api/reports") ||
    pathname.startsWith("/api/auth")
  ) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  // All other routes require auth
  const { user, supabaseResponse } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  // Onboarding check — if no org, redirect to onboarding
  // Use service client to bypass user_orgs RLS (which causes infinite recursion)
  if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/demo") && !pathname.startsWith("/contractor") && !pathname.startsWith("/portal")) {
    const service = await createServiceClient()
    const { data: orgs } = await service
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)

    if (!orgs?.length) {
      return NextResponse.redirect(new URL("/onboarding", request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
