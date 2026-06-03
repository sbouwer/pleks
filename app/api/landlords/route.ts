/**
 * app/api/landlords/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
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

interface LandlordPatchBody {
  landlordId?: string; contactId?: string
  entityType?: string; firstName?: string; lastName?: string; companyName?: string
  tradingAs?: string; registrationNumber?: string; vatNumber?: string
  email?: string; phone?: string; notes?: string
  // Banking moved to contact_bank_accounts — edited via /api/landlords/[id]/contact-details (type: bank_account)
  taxNumber?: string; paymentMethod?: string
}

function buildLandlordContactUpdate(b: LandlordPatchBody): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (b.firstName !== undefined) u.first_name = b.firstName?.trim() || null
  if (b.lastName !== undefined) u.last_name = b.lastName?.trim() || null
  if (b.entityType !== undefined) u.entity_type = b.entityType
  if (b.companyName !== undefined) u.company_name = b.companyName?.trim() || null
  if (b.tradingAs !== undefined) u.trading_as = b.tradingAs?.trim() || null
  if (b.registrationNumber !== undefined) u.registration_number = b.registrationNumber?.trim() || null
  if (b.vatNumber !== undefined) u.vat_number = b.vatNumber?.trim() || null
  if (b.email !== undefined) u.primary_email = b.email?.trim() || null
  if (b.phone !== undefined) u.primary_phone = b.phone?.trim() || null
  if (b.notes !== undefined) u.notes = b.notes?.trim() || null
  return u
}

function buildLandlordUpdate(b: LandlordPatchBody): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (b.taxNumber !== undefined) u.tax_number = b.taxNumber?.trim() || null
  if (b.paymentMethod !== undefined) u.payment_method = b.paymentMethod || null
  return u
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json() as LandlordPatchBody
  if (!body.landlordId || !body.contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  const contactUpdate = buildLandlordContactUpdate(body)
  if (Object.keys(contactUpdate).length > 0) {
    const { error: contactError } = await service.from("contacts")
      .update(contactUpdate).eq("id", body.contactId).eq("org_id", membership.org_id)
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
  }

  const landlordUpdate = buildLandlordUpdate(body)
  if (Object.keys(landlordUpdate).length > 0) {
    const { error: landlordError } = await service.from("landlords")
      .update(landlordUpdate).eq("id", body.landlordId).eq("org_id", membership.org_id)
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
