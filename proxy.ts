import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

const PUBLIC_ROUTES = ["/", "/pricing", "/login", "/forgot-password", "/reset-password"]
const AUTH_ROUTES = ["/auth"]
const WEBHOOK_ROUTES = ["/api/webhooks", "/api/cron"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow webhooks, cron, static assets
  if (WEBHOOK_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Public routes — no auth required
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    AUTH_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/apply")
  ) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  // All other routes require auth
  const { user, supabase, supabaseResponse } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  // Onboarding check — if no org, redirect to onboarding
  if (!pathname.startsWith("/onboarding")) {
    const { data: orgs } = await supabase
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
