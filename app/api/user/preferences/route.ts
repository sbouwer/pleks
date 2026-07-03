/**
 * app/api/user/preferences/route.ts — read/update the signed-in user's per-org UI preferences
 *
 * Route:  GET/PATCH /api/user/preferences
 * Auth:   gateway() (agent session + org membership)
 * Data:   user_orgs.preferences (JSON column) for the caller's own membership row, scoped by userId + orgId.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess. These are the user's own
 *         saved UI prefs; a paused org's user editing them is "your data, always", not net-new value.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

// GET /api/user/preferences
// Returns { preferences, tier }
export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId, tier } = gw

  const { data, error: queryError } = await db
    .from("user_orgs")
    .select("preferences")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  logQueryError("GET user_orgs", queryError)

  return NextResponse.json({
    preferences: (data?.preferences as Record<string, unknown>) ?? {},
    tier: tier ?? null,
  })
}

// PATCH /api/user/preferences
// Body: { key: string, value: unknown }
// Merges { [key]: value } into user_orgs.preferences
export async function PATCH(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  const { key, value } = await req.json() as { key: string; value: unknown }
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 })

  // Read current preferences, merge single key
  const { data: current, error: currentError } = await db
    .from("user_orgs")
    .select("preferences")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  logQueryError("PATCH user_orgs", currentError)

  const merged = { ...((current?.preferences as Record<string, unknown>) ?? {}), [key]: value }

  await db
    .from("user_orgs")
    .update({ preferences: merged })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)

  return NextResponse.json({ ok: true })
}
