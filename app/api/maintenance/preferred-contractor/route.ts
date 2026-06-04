/**
 * app/api/maintenance/preferred-contractor/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("GET user_orgs", membershipError)

  if (!membership) return NextResponse.json({ contractor: null })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const propertyId = searchParams.get("property")

  if (!category) return NextResponse.json({ contractor: null })

  // Try property-specific preference first
  if (propertyId) {
    const { data: propPref, error: propPrefError } = await supabase
      .from("contractor_preferences")
      .select("contractor_id, contractor_view(id, first_name, last_name, company_name, phone, email)")
      .eq("org_id", membership.org_id)
      .eq("property_id", propertyId)
      .eq("category", category)
      .order("priority_order")
      .limit(1)
      .single()
    logQueryError("GET contractor_preferences", propPrefError)

    if (propPref?.contractor_view) {
      const c = propPref.contractor_view as unknown as { id: string; first_name: string; last_name: string; company_name: string; phone: string; email: string }
      return NextResponse.json({ contractor: c, scope: "property" })
    }
  }

  // Fall back to org-wide preference
  const { data: orgPref, error: orgPrefError } = await supabase
    .from("contractor_preferences")
    .select("contractor_id, contractor_view(id, first_name, last_name, company_name, phone, email)")
    .eq("org_id", membership.org_id)
    .is("property_id", null)
    .eq("category", category)
    .order("priority_order")
    .limit(1)
    .single()
    logQueryError("GET contractor_preferences", orgPrefError)

  if (orgPref?.contractor_view) {
    const c = orgPref.contractor_view as unknown as { id: string; first_name: string; last_name: string; company_name: string; phone: string; email: string }
    return NextResponse.json({ contractor: c, scope: "org" })
  }

  return NextResponse.json({ contractor: null, scope: null })
}
