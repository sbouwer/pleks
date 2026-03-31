import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

async function getMembership(service: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { name, email, phone, companyName, specialities } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const { data: contact, error: contactError } = await service.from("contacts").insert({
    org_id: membership.org_id,
    entity_type: companyName?.trim() ? "organisation" : "individual",
    primary_role: "contractor",
    first_name: name.trim(),
    company_name: companyName?.trim() || null,
    primary_email: email?.trim() || null,
    primary_phone: phone?.trim() || null,
    created_by: user.id,
  }).select("id").single()

  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Failed to create contact" }, { status: 500 })

  const { error } = await service.from("contractors").insert({
    org_id: membership.org_id,
    contact_id: contact.id,
    is_active: true,
    specialities: specialities ?? [],
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { contractorId, contactId, firstName, lastName, companyName, email, phone, specialities } = await req.json()
  if (!contractorId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  const { error: contactError } = await service.from("contacts")
    .update({
      first_name: firstName?.trim() || null,
      last_name: lastName?.trim() || null,
      company_name: companyName?.trim() || null,
      entity_type: companyName?.trim() ? "organisation" : "individual",
      primary_email: email?.trim() || null,
      primary_phone: phone?.trim() || null,
    })
    .eq("id", contactId)
    .eq("org_id", membership.org_id)

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })

  const { error: conError } = await service.from("contractors")
    .update({ specialities: specialities ?? [] })
    .eq("id", contractorId)
    .eq("org_id", membership.org_id)

  if (conError) return NextResponse.json({ error: conError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only the account owner can delete contractors" }, { status: 403 })
  }

  const { contractorId, contactId } = await req.json()
  if (!contractorId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  await service.from("contractors").delete().eq("id", contractorId).eq("org_id", membership.org_id)
  await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId).eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
