/**
 * app/api/maintenance/preferred-contractor/route.ts — resolve the preferred contractor for a category
 *
 * Route:  GET /api/maintenance/preferred-contractor?category=&property=
 * Auth:   gateway() (agent session + org membership)
 * Data:   contractor_preferences (org-scoped via gateway orgId) — property-specific preference first,
 *         then falls back to the org-wide preference.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: Request) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ contractor: null })
  const { db, orgId } = gw

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const propertyId = searchParams.get("property")

  if (!category) return NextResponse.json({ contractor: null })

  // Try property-specific preference first
  if (propertyId) {
    const { data: propPref, error: propPrefError } = await db
      .from("contractor_preferences")
      .select("contractor_id, contractor_view(id, first_name, last_name, company_name, phone, email)")
      .eq("org_id", orgId)
      .eq("property_id", propertyId)
      .eq("category", category)
      .order("priority_order")
      .limit(1)
      .maybeSingle()
    logQueryError("GET contractor_preferences", propPrefError)

    if (propPref?.contractor_view) {
      const c = propPref.contractor_view as unknown as { id: string; first_name: string; last_name: string; company_name: string; phone: string; email: string }
      return NextResponse.json({ contractor: c, scope: "property" })
    }
  }

  // Fall back to org-wide preference
  const { data: orgPref, error: orgPrefError } = await db
    .from("contractor_preferences")
    .select("contractor_id, contractor_view(id, first_name, last_name, company_name, phone, email)")
    .eq("org_id", orgId)
    .is("property_id", null)
    .eq("category", category)
    .order("priority_order")
    .limit(1)
    .maybeSingle()
  logQueryError("GET contractor_preferences", orgPrefError)

  if (orgPref?.contractor_view) {
    const c = orgPref.contractor_view as unknown as { id: string; first_name: string; last_name: string; company_name: string; phone: string; email: string }
    return NextResponse.json({ contractor: c, scope: "org" })
  }

  return NextResponse.json({ contractor: null, scope: null })
}
