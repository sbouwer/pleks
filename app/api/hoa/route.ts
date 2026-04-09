import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST /api/hoa — create a new HOA entity
export async function POST(req: NextRequest) {
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

  // Firm tier only
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .eq("status", "active")
    .single()

  if (sub?.tier !== "firm") {
    return NextResponse.json({ error: "HOA management requires Firm tier" }, { status: 403 })
  }

  const body = await req.json() as {
    name: string
    entity_type: string
    property_id: string
    registration_number?: string
    csos_registration_number?: string
    financial_year_end_month?: number
    managing_agent_name?: string
    trustees_count?: number
    registered_address?: string
  }

  if (!body.name?.trim() || !body.entity_type || !body.property_id) {
    return NextResponse.json({ error: "name, entity_type and property_id are required" }, { status: 400 })
  }

  // Verify property belongs to this org
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", body.property_id)
    .eq("org_id", membership.org_id)
    .single()

  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 })

  const { data: hoa, error } = await supabase
    .from("hoa_entities")
    .insert({
      org_id: membership.org_id,
      name: body.name.trim(),
      entity_type: body.entity_type,
      property_id: body.property_id,
      registration_number: body.registration_number?.trim() || null,
      csos_registration_number: body.csos_registration_number?.trim() || null,
      financial_year_end_month: body.financial_year_end_month ?? 2,
      managing_agent_name: body.managing_agent_name?.trim() || null,
      trustees_count: body.trustees_count ?? 3,
      registered_address: body.registered_address?.trim() || null,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: hoa.id }, { status: 201 })
}
