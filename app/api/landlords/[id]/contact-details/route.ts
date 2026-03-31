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

async function verifyLandlordOwnership(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  landlordId: string,
  contactId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await service
    .from("landlords")
    .select("id")
    .eq("id", landlordId)
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .single()
  return !!data
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: landlordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json()
  const { type, contactId } = body

  const valid = await verifyLandlordOwnership(service, landlordId, contactId, membership.org_id)
  if (!valid) return NextResponse.json({ error: "Landlord not found" }, { status: 404 })

  if (type === "phone") {
    const { number, phone_type, label, is_primary, can_whatsapp } = body
    if (!number?.trim()) return NextResponse.json({ error: "Number is required" }, { status: 400 })

    const { error } = await service.from("contact_phones").insert({
      org_id: membership.org_id,
      contact_id: contactId,
      number: number.trim(),
      phone_type: phone_type ?? "mobile",
      label: label ?? null,
      is_primary: is_primary ?? false,
      can_whatsapp: can_whatsapp ?? false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === "email") {
    const { email, email_type, label, is_primary } = body
    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 })

    const { error } = await service.from("contact_emails").insert({
      org_id: membership.org_id,
      contact_id: contactId,
      email: email.trim(),
      email_type: email_type ?? "work",
      label: label ?? null,
      is_primary: is_primary ?? false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === "address") {
    const { street_line1, street_line2, suburb, city, province, postal_code, address_type, is_primary } = body

    const { error } = await service.from("contact_addresses").insert({
      org_id: membership.org_id,
      contact_id: contactId,
      street_line1: street_line1 ?? null,
      street_line2: street_line2 ?? null,
      suburb: suburb ?? null,
      city: city ?? null,
      province: province ?? null,
      postal_code: postal_code ?? null,
      address_type: address_type ?? "physical",
      is_primary: is_primary ?? false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id: landlordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json()
  const { type, id, contactId } = body
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const valid = await verifyLandlordOwnership(service, landlordId, contactId, membership.org_id)
  if (!valid) return NextResponse.json({ error: "Landlord not found" }, { status: 404 })

  if (type === "phone") {
    const { number, phone_type, label, can_whatsapp } = body
    const { error } = await service.from("contact_phones")
      .update({
        number: number?.trim(),
        phone_type: phone_type ?? "mobile",
        label: label ?? null,
        can_whatsapp: can_whatsapp ?? false,
      })
      .eq("id", id)
      .eq("contact_id", contactId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === "email") {
    const { email, email_type, label } = body
    const { error } = await service.from("contact_emails")
      .update({
        email: email?.trim(),
        email_type: email_type ?? "work",
        label: label ?? null,
      })
      .eq("id", id)
      .eq("contact_id", contactId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === "address") {
    const { street_line1, street_line2, suburb, city, province, postal_code, address_type } = body
    const { error } = await service.from("contact_addresses")
      .update({
        street_line1: street_line1 ?? null,
        street_line2: street_line2 ?? null,
        suburb: suburb ?? null,
        city: city ?? null,
        province: province ?? null,
        postal_code: postal_code ?? null,
        address_type: address_type ?? "physical",
      })
      .eq("id", id)
      .eq("contact_id", contactId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id: landlordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json()
  const { type, id, contactId } = body
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const valid = await verifyLandlordOwnership(service, landlordId, contactId, membership.org_id)
  if (!valid) return NextResponse.json({ error: "Landlord not found" }, { status: 404 })

  if (type === "phone") {
    const { error } = await service.from("contact_phones")
      .delete()
      .eq("id", id)
      .eq("contact_id", contactId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === "email") {
    const { error } = await service.from("contact_emails")
      .delete()
      .eq("id", id)
      .eq("contact_id", contactId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === "address") {
    const { error } = await service.from("contact_addresses")
      .delete()
      .eq("id", id)
      .eq("contact_id", contactId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}
