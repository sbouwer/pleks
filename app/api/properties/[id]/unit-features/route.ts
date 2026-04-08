import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/properties/[id]/unit-features
// Returns the union of features across all units in a property.
// Used by PropertyRulesEditor to suggest relevant library rules.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { data: units } = await supabase
    .from("units")
    .select("features")
    .eq("property_id", propertyId)
    .is("deleted_at", null)

  if (!units) return NextResponse.json({ features: [] })

  // Union of features across all units
  const allFeatures = new Set<string>()
  for (const unit of units) {
    const features = unit.features as string[] | null
    if (Array.isArray(features)) {
      for (const f of features) allFeatures.add(f)
    }
  }

  return NextResponse.json({ features: Array.from(allFeatures) })
}
