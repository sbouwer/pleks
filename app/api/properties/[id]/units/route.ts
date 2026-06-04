/**
 * app/api/properties/[id]/units/route.ts — FILL: one-line purpose
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, unit_number, access_instructions")
    .eq("property_id", propertyId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .order("unit_number")
    logQueryError("GET units", unitsError)

  return NextResponse.json({ units: units ?? [] })
}
