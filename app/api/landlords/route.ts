import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { data, error } = await service
    .from("landlords")
    .select("id, contacts(id, first_name, last_name, company_name, primary_email)")
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ landlords: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { firstName, lastName, email, phone, idNumber, companyName } = await req.json()

  if (!firstName?.trim() && !lastName?.trim() && !companyName?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // Create contact first
  const { data: contact, error: contactError } = await service.from("contacts").insert({
    org_id: membership.org_id,
    entity_type: companyName?.trim() ? "organisation" : "individual",
    primary_role: "landlord",
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    company_name: companyName?.trim() || null,
    primary_email: email?.trim() || null,
    primary_phone: phone?.trim() || null,
    id_number: idNumber?.trim() || null,
    created_by: user.id,
  }).select("id").single()

  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Failed to create contact" }, { status: 500 })

  // Create thin landlord record
  const { data: landlord, error } = await service.from("landlords").insert({
    org_id: membership.org_id,
    contact_id: contact.id,
    created_by: user.id,
  }).select("id").single()

  if (error || !landlord) return NextResponse.json({ error: error?.message || "Failed to create landlord" }, { status: 500 })

  return NextResponse.json({ ok: true, landlordId: landlord.id })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const {
    landlordId, contactId,
    // Contact fields
    entityType, firstName, lastName, companyName, tradingAs, registrationNumber, vatNumber,
    email, phone, notes,
    // Landlord fields
    bankName, bankAccount, bankBranch, bankAccountType, taxNumber, paymentMethod,
  } = await req.json()
  if (!landlordId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  // Build contact update (only include defined fields)
  const contactUpdate: Record<string, unknown> = {}
  if (firstName !== undefined) contactUpdate.first_name = firstName?.trim() || null
  if (lastName !== undefined) contactUpdate.last_name = lastName?.trim() || null
  if (entityType !== undefined) contactUpdate.entity_type = entityType
  if (companyName !== undefined) contactUpdate.company_name = companyName?.trim() || null
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

  // Build landlord update
  const landlordUpdate: Record<string, unknown> = {}
  if (bankName !== undefined) landlordUpdate.bank_name = bankName?.trim() || null
  if (bankAccount !== undefined) landlordUpdate.bank_account = bankAccount?.trim() || null
  if (bankBranch !== undefined) landlordUpdate.bank_branch = bankBranch?.trim() || null
  if (bankAccountType !== undefined) landlordUpdate.bank_account_type = bankAccountType || null
  if (taxNumber !== undefined) landlordUpdate.tax_number = taxNumber?.trim() || null
  if (paymentMethod !== undefined) landlordUpdate.payment_method = paymentMethod || null

  if (Object.keys(landlordUpdate).length > 0) {
    const { error: landlordError } = await service.from("landlords")
      .update(landlordUpdate)
      .eq("id", landlordId)
      .eq("org_id", membership.org_id)
    if (landlordError) return NextResponse.json({ error: landlordError.message }, { status: 500 })
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

  if (!membership.isAdmin) {
    return NextResponse.json({ error: "Admin access required to delete landlords" }, { status: 403 })
  }

  const { landlordId, contactId } = await req.json()
  if (!landlordId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  await service.from("landlords").delete().eq("id", landlordId).eq("org_id", membership.org_id)
  await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId).eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
