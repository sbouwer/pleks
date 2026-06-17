/**
 * app/api/switch-role/route.ts — switch the active role/org for a multi-role user
 *
 * Route:  POST /api/switch-role  { role, scope_id, org_id }
 * Auth:   Supabase session (auth.getUser). The target {role, scope_id, org_id} MUST be a membership the user
 *         actually holds — validated against resolveUserRoles (the same authoritative list the RoleSwitcher reads)
 *         → 403 otherwise. No privilege escalation: you can only switch to a role you already hold.
 * Notes:  Sets the durable pleks_has_org for the target + CLEARS pleks_org, so proxy.ts ensureOrgCookies
 *         re-hydrates pleks_org for the new org on the redirect (reuses refreshOrgCookieParallel — no cookie-shape
 *         duplication here). Emits role_switched (a previously declared-but-never-emitted auth event). 303-redirects
 *         to the role's default route so the RoleSwitcher's fetch follows it (GET, not a re-POST) and reads res.url.
 *         Portal targets set the slim portal cookie — the portal SESSION (getXSession token) remains the access
 *         gate, so a switch without one lands on the portal login (safe, not escalation).
 *         ⚠ Walk before trusting: multi-org agent A↔B switch + an agent↔portal switch.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveUserRoles, ROLE_DEFAULT_ROUTES } from "@/lib/auth/roles"
import { logAuthEvent } from "@/lib/auth/events"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: { role?: string; scope_id?: string; org_id?: string }
  try {
    body = (await req.json()) as { role?: string; scope_id?: string; org_id?: string }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const { role, scope_id, org_id } = body
  if (!role || !scope_id || !org_id) {
    return NextResponse.json({ error: "role, scope_id and org_id are required" }, { status: 400 })
  }

  // Escalation gate: the target must be a membership this user actually holds.
  const roles = await resolveUserRoles(user.id)
  const target = roles.find((r) => r.role === role && r.scope_id === scope_id && r.org_id === org_id)
  if (!target) {
    return NextResponse.json({ error: "You don't hold that role" }, { status: 403 })
  }

  // Durable active-role hint for proxy.ts ensureOrgCookies; clearing pleks_org makes it re-hydrate for the new org.
  const hasOrgValue =
    target.scope === "org"
      ? JSON.stringify({ org_id: target.org_id, user_id: user.id, role: target.role, portal_class: "agent" })
      : JSON.stringify({ org_id: target.org_id, user_id: user.id, portal_class: target.scope })

  const dest = ROLE_DEFAULT_ROUTES[target.role] ?? "/dashboard"
  const res = NextResponse.redirect(new URL(dest, req.url), 303)
  res.cookies.set("pleks_has_org", hasOrgValue, { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
  res.cookies.set("pleks_org", "", { ...AUTH_COOKIE_OPTS, maxAge: 0 })

  await logAuthEvent({
    userId: user.id,
    eventType: "role_switched",
    success: true,
    orgId: target.org_id,
    activeRole: target.role,
    metadata: { scope: target.scope, scope_id: target.scope_id },
  })

  return res
}
