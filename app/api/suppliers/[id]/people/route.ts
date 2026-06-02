/**
 * app/api/suppliers/[id]/people/route.ts — add / remove people under a supplier (company) contact
 *
 * Route:  POST/DELETE /api/suppliers/:id/people  (:id = contractor id)
 * Auth:   self-validated (auth.getUser) + org membership; DELETE is owner-only
 * Data:   contacts rows under the supplier's company contact via organisation_contact_id (ADDENDUM_25A)
 * Notes:  Replaces the retired contractor_contacts bridge. A person is a first-class individual contact
 *         (primary_role='company_contact') linked to the supplier's organisation contact. Only an
 *         organisation supplier has people (a sole-proprietor individual supplier has none).
 */
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

/** Resolve the supplier's organisation contact id (the anchor people hang off), scoped to the org. */
async function getSupplierCompanyContact(
  service: Awaited<ReturnType<typeof createServiceClient>>, contractorId: string, orgId: string,
): Promise<{ ok: true; contactId: string } | { ok: false; status: number; error: string }> {
  const { data: contractor } = await service
    .from("contractors").select("contact_id").eq("id", contractorId).eq("org_id", orgId).single()
  if (!contractor) return { ok: false, status: 404, error: "Contractor not found" }

  const { data: company } = await service
    .from("contacts").select("id, entity_type").eq("id", contractor.contact_id).eq("org_id", orgId).single()
  if (!company) return { ok: false, status: 404, error: "Supplier contact not found" }
  if (company.entity_type !== "organisation") {
    return { ok: false, status: 400, error: "This supplier is an individual — it has no people to add" }
  }
  return { ok: true, contactId: company.id as string }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: contractorId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { firstName, lastName, email, phone, companyFunction, designation } = await req.json()
  if (!firstName?.trim() && !lastName?.trim()) {
    return NextResponse.json({ error: "First or last name is required" }, { status: 400 })
  }

  const company = await getSupplierCompanyContact(service, contractorId, membership.org_id)
  if (!company.ok) return NextResponse.json({ error: company.error }, { status: company.status })

  const { data: contact, error } = await service.from("contacts").insert({
    org_id: membership.org_id,
    entity_type: "individual",
    primary_role: "company_contact",
    organisation_contact_id: company.contactId,
    company_function: companyFunction?.trim() || "other",
    designation: designation?.trim() || null,
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    primary_email: email?.trim() || null,
    primary_phone: phone?.trim() || null,
    created_by: user.id,
  }).select("id").single()

  if (error || !contact) {
    return NextResponse.json({ error: error?.message || "Failed to add person" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: contact.id })
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

  const { contactId } = await req.json()
  if (!contactId) return NextResponse.json({ error: "Missing contactId" }, { status: 400 })

  const company = await getSupplierCompanyContact(service, contractorId, membership.org_id)
  if (!company.ok) return NextResponse.json({ error: company.error }, { status: company.status })

  // The person must be a sub-contact of this supplier's company contact.
  const { data: person } = await service
    .from("contacts").select("id")
    .eq("id", contactId)
    .eq("org_id", membership.org_id)
    .eq("organisation_contact_id", company.contactId)
    .single()
  if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 })

  await service.from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
