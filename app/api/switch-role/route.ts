/**
 * app/api/switch-role/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { resolveUserRoles, ROLE_DEFAULT_ROUTES, type SessionRole } from "@/lib/auth/roles"

interface SwitchRoleBody {
  role: string
  scope_id: string
  org_id: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: SwitchRoleBody
  try {
    body = await req.json() as SwitchRoleBody
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!body.role || !body.scope_id || !body.org_id) {
    return NextResponse.json({ error: "Missing role, scope_id, or org_id" }, { status: 400 })
  }

  // Verify server-side that this role is actually available to the user
  const memberships = await resolveUserRoles(user.id)
  const target = memberships.find(
    m => m.role === body.role && m.scope_id === body.scope_id && m.org_id === body.org_id
  )

  if (!target) {
    return NextResponse.json({ error: "Role not available" }, { status: 403 })
  }

  // Read current role for audit trail
  let fromRole: string | null = null
  let fromScopeId: string | null = null
  let fromOrgId: string | null = null
  try {
    const raw = req.cookies.get("pleks_active_role")?.value
    if (raw) {
      const cur = JSON.parse(raw) as { role?: string; scope_id?: string; org_id?: string }
      fromRole = cur.role ?? null
      fromScopeId = cur.scope_id ?? null
      fromOrgId = cur.org_id ?? null
    }
  } catch { /* no prior active role */ }

  // Write audit_log entry (unconditional)
  const service = await createServiceClient()
  const sessionId = crypto.randomUUID()
  await service.from("audit_log").insert({
    org_id:      body.org_id,
    table_name:  "user_sessions",
    record_id:   null,
    action:      "role_switched",
    changed_by:  user.id,
    old_values:  fromRole ? { role: fromRole, scope_id: fromScopeId, org_id: fromOrgId } : null,
    new_values:  { role: body.role, scope_id: body.scope_id, org_id: body.org_id, session_id: sessionId },
  })

  // auth_events dual-write — no-ops gracefully until BUILD_62 ships the table
  try {
    await service.from("auth_events").insert({
      org_id:      body.org_id,
      user_id:     user.id,
      event_type:  "role_switched",
      auth_method: "session_cookie",
      active_role: body.role,
      success:     true,
      session_id:  sessionId,
      metadata:    { from_role: fromRole, to_role: body.role, from_scope_id: fromScopeId, to_scope_id: body.scope_id },
    })
  } catch { /* auth_events table not yet created — BUILD_62 will add it */ }

  // Set cookies and redirect
  const destination = ROLE_DEFAULT_ROUTES[body.role as SessionRole] ?? "/dashboard"
  const res = NextResponse.redirect(new URL(destination, req.url))

  res.cookies.set("pleks_active_role", JSON.stringify({
    role:     body.role,
    scope_id: body.scope_id,
    org_id:   body.org_id,
  }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })

  res.cookies.set("pleks_available_roles", JSON.stringify(memberships), {
    ...AUTH_COOKIE_OPTS, maxAge: 60 * 5,
  })

  return res
}
