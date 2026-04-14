import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

async function getMembership(service: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data } = await service
    .from("user_orgs")
    .select("org_id, role, is_admin")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single()
  if (!data) return null
  const row = data as unknown as { org_id: string; role: string; is_admin: boolean }
  return {
    org_id: row.org_id,
    role: row.role,
    isAdmin: row.role === "owner" || row.is_admin === true,
  }
}

interface TenantPatchBody {
  tenantId: string; contactId: string
  entityType?: string; firstName?: string; lastName?: string; companyName?: string
  registrationNumber?: string; vatNumber?: string
  email?: string; phone?: string; notes?: string
  nationality?: string; idNumber?: string; idType?: string; dateOfBirth?: string
  employerName?: string; employerPhone?: string; occupation?: string; employmentType?: string
  preferredContact?: string; blacklisted?: boolean; blacklistedReason?: string
}

function buildTenantContactUpdate(body: TenantPatchBody): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (body.firstName !== undefined) u.first_name = body.firstName?.trim() || null
  if (body.lastName !== undefined) u.last_name = body.lastName?.trim() || null
  if (body.entityType !== undefined) u.entity_type = body.entityType
  if (body.companyName !== undefined) u.company_name = body.companyName?.trim() || null
  if (body.registrationNumber !== undefined) u.registration_number = body.registrationNumber?.trim() || null
  if (body.vatNumber !== undefined) u.vat_number = body.vatNumber?.trim() || null
  if (body.email !== undefined) u.primary_email = body.email?.trim() || null
  if (body.phone !== undefined) u.primary_phone = body.phone?.trim() || null
  if (body.notes !== undefined) u.notes = body.notes?.trim() || null
  if (body.nationality !== undefined) u.nationality = body.nationality?.trim() || null
  if (body.idNumber !== undefined) u.id_number = body.idNumber?.trim() || null
  if (body.idType !== undefined) u.id_type = body.idType || null
  if (body.dateOfBirth !== undefined) u.date_of_birth = body.dateOfBirth || null
  return u
}

function buildTenantUpdate(body: TenantPatchBody): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (body.employerName !== undefined) u.employer_name = body.employerName?.trim() || null
  if (body.employerPhone !== undefined) u.employer_phone = body.employerPhone?.trim() || null
  if (body.occupation !== undefined) u.occupation = body.occupation?.trim() || null
  if (body.employmentType !== undefined) u.employment_type = body.employmentType || null
  if (body.preferredContact !== undefined) u.preferred_contact = body.preferredContact || null
  if (body.blacklisted !== undefined) u.blacklisted = body.blacklisted
  if (body.blacklistedReason !== undefined) u.blacklisted_reason = body.blacklistedReason?.trim() || null
  return u
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json() as TenantPatchBody
  if (!body.tenantId || !body.contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  const contactUpdate = buildTenantContactUpdate(body)
  if (Object.keys(contactUpdate).length > 0) {
    const { error: contactError } = await service.from("contacts")
      .update(contactUpdate)
      .eq("id", body.contactId)
      .eq("org_id", membership.org_id)
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
  }

  const tenantUpdate = buildTenantUpdate(body)
  if (Object.keys(tenantUpdate).length > 0) {
    const { error: tenantError } = await service.from("tenants")
      .update(tenantUpdate)
      .eq("id", body.tenantId)
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

  if (!membership.isAdmin) {
    return NextResponse.json({ error: "Admin access required to delete tenants" }, { status: 403 })
  }

  const { tenantId, contactId } = await req.json()
  if (!tenantId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  await service.from("tenants").delete().eq("id", tenantId).eq("org_id", membership.org_id)
  await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId).eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
