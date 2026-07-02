/**
 * app/api/properties/[id]/units/route.ts — unit list (number + access instructions) for a property
 *
 * Route:  GET /api/properties/[id]/units
 * Auth:   gateway() (agent session + org membership)
 * Data:   units, org-scoped via gateway orgId, filtered to the property.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params

  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: units, error: unitsError } = await db
    .from("units")
    .select("id, unit_number, access_instructions")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .is("deleted_at", null)
    .order("unit_number")
  logQueryError("GET units", unitsError)

  return NextResponse.json({ units: units ?? [] })
}
