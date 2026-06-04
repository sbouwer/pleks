/**
 * app/api/tenants/route.ts — tenant edit + archive/restore for the tenants list
 *
 * Route:  /api/tenants (PATCH edit|restore · DELETE archive)
 * Auth:   authenticated org member; archive/restore are admin-only
 * Data:   tenants (+ contacts), org-scoped service client
 * Notes:  DELETE = ARCHIVE (soft-delete, set deleted_at), NOT erase — blocked while an in-force lease
 *         exists (tenantHasInForceLease). Raw .delete() on tenants is forbidden outside
 *         lib/popia/erasure.ts (pleks/no-popia-raw-delete). See ADDENDUM_ARCHIVE_VS_ERASE.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"
import { tenantHasInForceLease } from "@/lib/parties/archive"

interface TenantPatchBody {
  tenantId: string; contactId: string
  /** Restore an archived tenant (clears deleted_at). Admin-only; mutually exclusive with field edits. */
  restore?: boolean
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

  // Restore an archived tenant (un-archive) — admin-only, separate from field edits.
  if (body.restore) {
    if (!membership.isAdmin) return NextResponse.json({ error: "Admin access required to restore tenants" }, { status: 403 })
    if (!body.tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 })
    const { error: restoreError } = await service.from("tenants")
      .update({ deleted_at: null })
      .eq("id", body.tenantId)
      .eq("org_id", membership.org_id)
    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 })
    await service.from("audit_log").insert({
      org_id: membership.org_id, table_name: "tenants", record_id: body.tenantId,
      action: "RESTORE", changed_by: user.id, new_values: { deleted_at: null },
    })
    return NextResponse.json({ ok: true })
  }

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

// DELETE = ARCHIVE (soft-delete), not erase. Sets tenants.deleted_at so the party drops out of active
// lists but stays FK-intact and exportable ("Your Data, Always"). Blocked while an in-force lease exists.
// True POPIA erasure is the request-backed anonymise cascade in lib/popia/erasure.ts (Phase 2) — never
// a raw delete here (enforced by pleks/no-popia-raw-delete). See ADDENDUM_ARCHIVE_VS_ERASE.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  if (!membership.isAdmin) {
    return NextResponse.json({ error: "Admin access required to archive tenants" }, { status: 403 })
  }

  const { tenantId } = await req.json()
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 })

  // Guard: a tenant on an in-force lease (active / month_to_month / notice) cannot be archived.
  if (await tenantHasInForceLease(service, membership.org_id, tenantId)) {
    return NextResponse.json({ error: "in_force_lease" }, { status: 409 })
  }

  const { error } = await service.from("tenants")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", tenantId)
    .eq("org_id", membership.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service.from("audit_log").insert({
    org_id: membership.org_id, table_name: "tenants", record_id: tenantId,
    action: "ARCHIVE", changed_by: user.id, new_values: { deleted_at: new Date().toISOString() },
  })

  return NextResponse.json({ ok: true })
}
