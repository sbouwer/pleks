/**
 * app/api/properties/[id]/unit-features/route.ts — union of unit features across a property
 *
 * Route:  GET /api/properties/[id]/unit-features
 * Auth:   gateway() (agent session + org membership)
 * Data:   units (org-scoped via gateway orgId), filtered to the property; used by PropertyRulesEditor
 *         to suggest relevant library rules.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: units, error: unitsError } = await db
    .from("units")
    .select("features")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .is("deleted_at", null)
  logQueryError("GET units", unitsError)

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
