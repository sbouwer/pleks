import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { firstName, lastName, email, phone, idNumber } = await req.json()

  if (!firstName?.trim() && !lastName?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // Create contact first
  const { data: contact, error: contactError } = await service.from("contacts").insert({
    org_id: membership.org_id,
    entity_type: "individual",
    primary_role: "landlord",
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    primary_email: email?.trim() || null,
    primary_phone: phone?.trim() || null,
    id_number: idNumber?.trim() || null,
    created_by: user.id,
  }).select("id").single()

  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Failed to create contact" }, { status: 500 })

  // Create thin landlord record
  const { error } = await service.from("landlords").insert({
    org_id: membership.org_id,
    contact_id: contact.id,
    created_by: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
