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

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const {
    tenantId, contactId,
    // Contact fields
    entityType, firstName, lastName, companyName, registrationNumber, vatNumber,
    email, phone, notes, nationality, idNumber, idType, dateOfBirth,
    // Tenant fields
    employerName, employerPhone, occupation, employmentType,
    preferredContact, blacklisted, blacklistedReason,
  } = await req.json()

  if (!tenantId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  // Build contact update (only include defined fields)
  const contactUpdate: Record<string, unknown> = {}
  if (firstName !== undefined) contactUpdate.first_name = firstName?.trim() || null
  if (lastName !== undefined) contactUpdate.last_name = lastName?.trim() || null
  if (entityType !== undefined) contactUpdate.entity_type = entityType
  if (companyName !== undefined) contactUpdate.company_name = companyName?.trim() || null
  if (registrationNumber !== undefined) contactUpdate.registration_number = registrationNumber?.trim() || null
  if (vatNumber !== undefined) contactUpdate.vat_number = vatNumber?.trim() || null
  if (email !== undefined) contactUpdate.primary_email = email?.trim() || null
  if (phone !== undefined) contactUpdate.primary_phone = phone?.trim() || null
  if (notes !== undefined) contactUpdate.notes = notes?.trim() || null
  if (nationality !== undefined) contactUpdate.nationality = nationality?.trim() || null
  if (idNumber !== undefined) contactUpdate.id_number = idNumber?.trim() || null
  if (idType !== undefined) contactUpdate.id_type = idType || null
  if (dateOfBirth !== undefined) contactUpdate.date_of_birth = dateOfBirth || null

  if (Object.keys(contactUpdate).length > 0) {
    const { error: contactError } = await service.from("contacts")
      .update(contactUpdate)
      .eq("id", contactId)
      .eq("org_id", membership.org_id)
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
  }

  // Build tenant update
  const tenantUpdate: Record<string, unknown> = {}
  if (employerName !== undefined) tenantUpdate.employer_name = employerName?.trim() || null
  if (employerPhone !== undefined) tenantUpdate.employer_phone = employerPhone?.trim() || null
  if (occupation !== undefined) tenantUpdate.occupation = occupation?.trim() || null
  if (employmentType !== undefined) tenantUpdate.employment_type = employmentType || null
  if (preferredContact !== undefined) tenantUpdate.preferred_contact = preferredContact || null
  if (blacklisted !== undefined) tenantUpdate.blacklisted = blacklisted
  if (blacklistedReason !== undefined) tenantUpdate.blacklisted_reason = blacklistedReason?.trim() || null

  if (Object.keys(tenantUpdate).length > 0) {
    const { error: tenantError } = await service.from("tenants")
      .update(tenantUpdate)
      .eq("id", tenantId)
      .eq("org_id", membership.org_id)
    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

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
    return NextResponse.json({ error: "Only the account owner can delete tenants" }, { status: 403 })
  }

  const { tenantId, contactId } = await req.json()
  if (!tenantId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  await service.from("tenants").delete().eq("id", tenantId).eq("org_id", membership.org_id)
  await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId).eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
