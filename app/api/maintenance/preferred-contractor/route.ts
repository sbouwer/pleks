import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ contractor: null })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const propertyId = searchParams.get("property")

  if (!category) return NextResponse.json({ contractor: null })

  // Try property-specific preference first
  if (propertyId) {
    const { data: propPref } = await supabase
      .from("contractor_preferences")
      .select("contractor_id, contractor_view(id, first_name, last_name, company_name, phone, email)")
      .eq("org_id", membership.org_id)
      .eq("property_id", propertyId)
      .eq("category", category)
      .order("priority_order")
      .limit(1)
      .single()

    if (propPref?.contractor_view) {
      const c = propPref.contractor_view as unknown as { id: string; first_name: string; last_name: string; company_name: string; phone: string; email: string }
      return NextResponse.json({ contractor: c, scope: "property" })
    }
  }

  // Fall back to org-wide preference
  const { data: orgPref } = await supabase
    .from("contractor_preferences")
    .select("contractor_id, contractor_view(id, first_name, last_name, company_name, phone, email)")
    .eq("org_id", membership.org_id)
    .is("property_id", null)
    .eq("category", category)
    .order("priority_order")
    .limit(1)
    .single()

  if (orgPref?.contractor_view) {
    const c = orgPref.contractor_view as unknown as { id: string; first_name: string; last_name: string; company_name: string; phone: string; email: string }
    return NextResponse.json({ contractor: c, scope: "org" })
  }

  return NextResponse.json({ contractor: null, scope: null })
}
