import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, access_instructions")
    .eq("property_id", propertyId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .order("unit_number")

  return NextResponse.json({ units: units ?? [] })
}
