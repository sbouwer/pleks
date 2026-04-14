import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getEffectiveTier } from "@/lib/tier/effectiveTier"

/**
 * POST /api/auth/refresh-tier
 *
 * Rewrites the pleks_org cookie with the current tier from the database.
 * Call this after a successful upgrade (PayFast return page) to make the
 * new tier visible immediately without requiring a logout.
 *
 * Also invalidate the client React Query cache by returning the new tier
 * so the caller can call queryClient.invalidateQueries(["subscription"]).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const service = await createServiceClient()

  // Get org membership
  const { data: orgRow } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()

  if (!orgRow) return NextResponse.json({ error: "No org" }, { status: 404 })

  // Get current subscription
  const { data: sub } = await service
    .from("subscriptions")
    .select("tier, status, trial_tier, trial_ends_at, trial_converted")
    .eq("org_id", orgRow.org_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const tier = sub ? getEffectiveTier(sub) : "owner"

  // Rewrite cookie
  const cookieStore = await cookies()
  cookieStore.set("pleks_org", JSON.stringify({
    org_id: orgRow.org_id,
    role: orgRow.role,
    tier,
    user_id: user.id,
  }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 })

  return NextResponse.json({ tier })
}
