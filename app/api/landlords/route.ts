/**
 * app/api/landlords/route.ts — landlord CRUD + archive/restore for the landlords list
 *
 * Route:  /api/landlords (GET list · POST create · PATCH edit|restore · DELETE archive)
 * Auth:   authenticated org member; archive/restore are admin-only
 * Data:   landlords (+ contacts), org-scoped service client; GET filters deleted_at (active only)
 * Notes:  DELETE = ARCHIVE (soft-delete, set deleted_at), NOT erase — blocked while an in-force lease
 *         exists (landlordHasInForceLease). Raw .delete() on landlords is forbidden outside
 *         lib/popia/erasure.ts (pleks/no-popia-raw-delete). See ADDENDUM_ARCHIVE_VS_ERASE.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"
import { landlordHasInForceLease } from "@/lib/parties/archive"
import { recordAudit } from "@/lib/audit/recordAudit"
import { idNumberColumns } from "@/lib/crypto/idNumber"
import { mandatoryGate, MissingMandatoryFieldsError, recomputeIncompleteMandatory } from "@/lib/migration/mandatoryGate"

const MANDATORY_COLS = "first_name,last_name,company_name,primary_email,primary_phone"
/** 21E §1 corollary 12: apply a partial landlord-contact edit, recomputing the flag from the MERGED record. */
async function patchLandlordContactRecomputing(
  service: Awaited<ReturnType<typeof createServiceClient>>, contactId: string, orgId: string, contactUpdate: Record<string, unknown>,
): Promise<string | null> {
  const { data: existing, error: exErr } = await service.from("contacts").select(MANDATORY_COLS).eq("id", contactId).eq("org_id", orgId).single()
  if (exErr) return exErr.message
  const { error } = await service.from("contacts")
    .update({ ...contactUpdate, ...recomputeIncompleteMandatory("landlord", existing, contactUpdate) }).eq("id", contactId).eq("org_id", orgId)
  return error ? error.message : null
}

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

  // 21E §1: this legacy CRUD route bypasses the party wizard, so it must run the SAME registry gate server-side.
  const landlordContact = {
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    company_name: companyName?.trim() || null,
    primary_email: email?.trim() || null,
    primary_phone: phone?.trim() || null,
  }
  let lGate: { incomplete_mandatory: null }
  try {
    lGate = mandatoryGate("landlord", landlordContact, { relax: false }) as { incomplete_mandatory: null }
  } catch (e) {
    if (e instanceof MissingMandatoryFieldsError) return NextResponse.json({ error: `Please add the landlord's ${e.missing.join(", ")}.` }, { status: 400 })
    throw e
  }

  // Create contact first
  const { data: contact, error: contactError } = await service.from("contacts").insert({
    org_id: membership.org_id,
    entity_type: companyName?.trim() ? "organisation" : "individual",
    primary_role: "landlord",
    ...landlordContact,
    ...lGate,
    ...idNumberColumns(idNumber), // encrypted at rest + lookup hash (was raw, no hash)
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
  /** Restore an archived landlord (clears deleted_at). Admin-only; mutually exclusive with field edits. */
  restore?: boolean
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

  // Restore an archived landlord (un-archive) — admin-only, separate from field edits.
  if (body.restore) {
    if (!membership.isAdmin) return NextResponse.json({ error: "Admin access required to restore landlords" }, { status: 403 })
    if (!body.landlordId) return NextResponse.json({ error: "Missing landlordId" }, { status: 400 })
    const { error: restoreError } = await service.from("landlords")
      .update({ deleted_at: null })
      .eq("id", body.landlordId)
      .eq("org_id", membership.org_id)
    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 })
    await recordAudit(service, {
      orgId: membership.org_id, actorId: user.id, action: "UPDATE",
      table: "landlords", recordId: body.landlordId, after: { action: "landlord_restored", deleted_at: null },
    })
    return NextResponse.json({ ok: true })
  }

  if (!body.landlordId || !body.contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  const contactUpdate = buildLandlordContactUpdate(body)
  if (Object.keys(contactUpdate).length > 0) {
    const err = await patchLandlordContactRecomputing(service, body.contactId, membership.org_id, contactUpdate)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
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
    return NextResponse.json({ error: "Admin access required to archive landlords" }, { status: 403 })
  }

  const { landlordId } = await req.json()
  if (!landlordId) return NextResponse.json({ error: "Missing landlordId" }, { status: 400 })

  // Guard: a landlord with an in-force lease (own or attributed) cannot be archived.
  if (await landlordHasInForceLease(service, membership.org_id, landlordId)) {
    return NextResponse.json({ error: "in_force_lease" }, { status: 409 })
  }

  const { error } = await service.from("landlords")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", landlordId)
    .eq("org_id", membership.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit(service, {
    orgId: membership.org_id, actorId: user.id, action: "DELETE",
    table: "landlords", recordId: landlordId,
    after: { action: "landlord_archived", deleted_at: new Date().toISOString() },
  })

  return NextResponse.json({ ok: true })
}
