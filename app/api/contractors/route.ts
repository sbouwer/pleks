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

  const { name, email, phone, companyName, specialities, supplierType } = await req.json()
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
    supplier_type: supplierType ?? "contractor",
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

  const {
    contractorId, contactId,
    // Contact fields
    firstName, lastName, companyName, tradingAs, registrationNumber, vatNumber,
    email, phone, notes,
    // Contractor fields
    specialities, isActive,
    callOutRateCents, hourlyRateCents,
    // Banking fields
    bankingName, bankName, bankAccountNumber, bankBranchCode, bankAccountType, vatRegistered,
  } = await req.json()
  if (!contractorId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  // Build contact update (only include defined fields)
  const contactUpdate: Record<string, unknown> = {}
  if (firstName !== undefined) contactUpdate.first_name = firstName?.trim() || null
  if (lastName !== undefined) contactUpdate.last_name = lastName?.trim() || null
  if (companyName !== undefined) {
    contactUpdate.company_name = companyName?.trim() || null
    contactUpdate.entity_type = companyName?.trim() ? "organisation" : "individual"
  }
  if (tradingAs !== undefined) contactUpdate.trading_as = tradingAs?.trim() || null
  if (registrationNumber !== undefined) contactUpdate.registration_number = registrationNumber?.trim() || null
  if (vatNumber !== undefined) contactUpdate.vat_number = vatNumber?.trim() || null
  if (email !== undefined) contactUpdate.primary_email = email?.trim() || null
  if (phone !== undefined) contactUpdate.primary_phone = phone?.trim() || null
  if (notes !== undefined) contactUpdate.notes = notes?.trim() || null

  if (Object.keys(contactUpdate).length > 0) {
    const { error: contactError } = await service.from("contacts")
      .update(contactUpdate)
      .eq("id", contactId)
      .eq("org_id", membership.org_id)
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
  }

  // Build contractor update
  const contractorUpdate: Record<string, unknown> = {}
  if (specialities !== undefined) contractorUpdate.specialities = specialities ?? []
  if (isActive !== undefined) contractorUpdate.is_active = isActive
  if (callOutRateCents !== undefined) contractorUpdate.call_out_rate_cents = callOutRateCents
  if (hourlyRateCents !== undefined) contractorUpdate.hourly_rate_cents = hourlyRateCents
  if (bankingName !== undefined) contractorUpdate.banking_name = bankingName?.trim() || null
  if (bankName !== undefined) contractorUpdate.bank_name = bankName?.trim() || null
  if (bankAccountNumber !== undefined) contractorUpdate.bank_account_number = bankAccountNumber?.trim() || null
  if (bankBranchCode !== undefined) contractorUpdate.bank_branch_code = bankBranchCode?.trim() || null
  if (bankAccountType !== undefined) contractorUpdate.bank_account_type = bankAccountType || null
  if (vatRegistered !== undefined) contractorUpdate.vat_registered = vatRegistered

  if (Object.keys(contractorUpdate).length > 0) {
    const { error: conError } = await service.from("contractors")
      .update(contractorUpdate)
      .eq("id", contractorId)
      .eq("org_id", membership.org_id)
    if (conError) return NextResponse.json({ error: conError.message }, { status: 500 })
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
    return NextResponse.json({ error: "Only the account owner can delete contractors" }, { status: 403 })
  }

  const { contractorId, contactId } = await req.json()
  if (!contractorId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  await service.from("contractors").delete().eq("id", contractorId).eq("org_id", membership.org_id)
  await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId).eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
