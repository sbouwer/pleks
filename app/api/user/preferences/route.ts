import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { getServerUser } from "@/lib/auth/server"

// GET /api/user/preferences
// Returns { preferences, tier }
export async function GET() {
  const [user, membership] = await Promise.all([
    getServerUser(),
    getServerOrgMembership(),
  ])
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createClient()
  const { data } = await supabase
    .from("user_orgs")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()

  return NextResponse.json({
    preferences: (data?.preferences as Record<string, unknown>) ?? {},
    tier: membership.tier ?? null,
  })
}

// PATCH /api/user/preferences
// Body: { key: string, value: unknown }
// Merges { [key]: value } into user_orgs.preferences
export async function PATCH(req: NextRequest) {
  const [user, membership] = await Promise.all([
    getServerUser(),
    getServerOrgMembership(),
  ])
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { key, value } = await req.json() as { key: string; value: unknown }
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 })

  const supabase = await createClient()

  // Read current preferences, merge single key
  const { data: current } = await supabase
    .from("user_orgs")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()

  const merged = { ...((current?.preferences as Record<string, unknown>) ?? {}), [key]: value }

  await supabase
    .from("user_orgs")
    .update({ preferences: merged })
    .eq("user_id", user.id)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)

  return NextResponse.json({ ok: true })
}
