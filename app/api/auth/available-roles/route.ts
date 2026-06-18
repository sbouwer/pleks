/**
 * app/api/auth/available-roles/route.ts — list a user's switchable role memberships
 *
 * Route:  GET /api/auth/available-roles
 * Auth:   Supabase session (auth.getUser); 401 with { roles: [] } when unauthenticated (RoleSwitcher falls back to [])
 * Data:   resolveUserRoles (lib/auth/roles) — enumerates agent/tenant/landlord memberships across bridge tables
 * Notes:  Feeds RoleSwitcher. This is the LIST counterpart to resolveUserMembership (lib/auth/membership), which
 *         resolves the single ACTIVE role for routing — there's no single-fn replacement for the enumeration, so
 *         resolveUserRoles is live, not deprecated. (RoleSwitcher's POST target /api/switch-role is still missing
 *         — tracked separately under the auth work, not here.)
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveUserRoles } from "@/lib/auth/roles"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ roles: [] }, { status: 401 })

  const roles = await resolveUserRoles(user.id)
  return NextResponse.json({ roles })
}
