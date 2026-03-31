import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

interface RouteContext {
  params: Promise<{ id: string }>
}

async function getMembership(service: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single()
  return data
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: contractorId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { firstName, lastName, email, phone, role } = await req.json()
  if (!firstName?.trim() && !lastName?.trim()) {
    return NextResponse.json({ error: "First or last name is required" }, { status: 400 })
  }

  // Verify the contractor belongs to this org
  const { data: contractor } = await service
    .from("contractors")
    .select("id")
    .eq("id", contractorId)
    .eq("org_id", membership.org_id)
    .single()
  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 })

  // Create the contact
  const { data: contact, error: contactError } = await service.from("contacts").insert({
    org_id: membership.org_id,
    entity_type: "individual",
    primary_role: "contractor_contact",
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    primary_email: email?.trim() || null,
    primary_phone: phone?.trim() || null,
    created_by: user.id,
  }).select("id").single()

  if (contactError || !contact) {
    return NextResponse.json({ error: contactError?.message || "Failed to create contact" }, { status: 500 })
  }

  // Link to contractor
  const { error: linkError } = await service.from("contractor_contacts").insert({
    org_id: membership.org_id,
    contractor_id: contractorId,
    contact_id: contact.id,
    role: role?.trim() || null,
    is_primary: false,
  })

  if (linkError) {
    // Cleanup the contact we just created
    await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contact.id)
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id: contractorId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only the account owner can remove people" }, { status: 403 })
  }

  const { contractorContactId, contactId } = await req.json()
  if (!contractorContactId || !contactId) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 })
  }

  // Verify ownership
  const { data: cc } = await service
    .from("contractor_contacts")
    .select("id")
    .eq("id", contractorContactId)
    .eq("contractor_id", contractorId)
    .eq("org_id", membership.org_id)
    .single()
  if (!cc) return NextResponse.json({ error: "Record not found" }, { status: 404 })

  // Remove the link
  await service.from("contractor_contacts").delete().eq("id", contractorContactId)

  // Soft-delete the contact
  await service.from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
