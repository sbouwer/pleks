import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"

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

interface ContractorPatchBody {
  contractorId: string; contactId: string
  entityType?: string; firstName?: string; lastName?: string; companyName?: string
  tradingAs?: string; registrationNumber?: string; vatNumber?: string
  email?: string; phone?: string; notes?: string
  specialities?: string[]; isActive?: boolean
  callOutRateCents?: number; hourlyRateCents?: number
  heritageApproved?: boolean; heritageSpecialities?: string[]
  bankingName?: string; bankName?: string; bankAccountNumber?: string
  bankBranchCode?: string; bankAccountType?: string; vatRegistered?: boolean
}

function buildContractorContactUpdate(body: ContractorPatchBody): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (body.entityType !== undefined) u.entity_type = body.entityType
  if (body.firstName !== undefined) u.first_name = body.firstName?.trim() || null
  if (body.lastName !== undefined) u.last_name = body.lastName?.trim() || null
  if (body.companyName !== undefined) u.company_name = body.companyName?.trim() || null
  if (body.tradingAs !== undefined) u.trading_as = body.tradingAs?.trim() || null
  if (body.registrationNumber !== undefined) u.registration_number = body.registrationNumber?.trim() || null
  if (body.vatNumber !== undefined) u.vat_number = body.vatNumber?.trim() || null
  if (body.email !== undefined) u.primary_email = body.email?.trim() || null
  if (body.phone !== undefined) u.primary_phone = body.phone?.trim() || null
  if (body.notes !== undefined) u.notes = body.notes?.trim() || null
  return u
}

function buildContractorUpdate(body: ContractorPatchBody): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (body.specialities !== undefined) u.specialities = body.specialities ?? []
  if (body.isActive !== undefined) u.is_active = body.isActive
  if (body.callOutRateCents !== undefined) u.call_out_rate_cents = body.callOutRateCents
  if (body.hourlyRateCents !== undefined) u.hourly_rate_cents = body.hourlyRateCents
  if (body.bankingName !== undefined) u.banking_name = body.bankingName?.trim() || null
  if (body.bankName !== undefined) u.bank_name = body.bankName?.trim() || null
  if (body.bankAccountNumber !== undefined) u.bank_account_number = body.bankAccountNumber?.trim() || null
  if (body.bankBranchCode !== undefined) u.bank_branch_code = body.bankBranchCode?.trim() || null
  if (body.bankAccountType !== undefined) u.bank_account_type = body.bankAccountType || null
  if (body.vatRegistered !== undefined) u.vat_registered = body.vatRegistered
  if (body.heritageApproved !== undefined) u.heritage_approved = body.heritageApproved
  if (body.heritageSpecialities !== undefined) u.heritage_specialities = body.heritageSpecialities
  return u
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json() as ContractorPatchBody
  if (!body.contractorId || !body.contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  const contactUpdate = buildContractorContactUpdate(body)
  if (Object.keys(contactUpdate).length > 0) {
    const { error: contactError } = await service.from("contacts")
      .update(contactUpdate)
      .eq("id", body.contactId)
      .eq("org_id", membership.org_id)
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
  }

  const contractorUpdate = buildContractorUpdate(body)
  if (Object.keys(contractorUpdate).length > 0) {
    const { error: conError } = await service.from("contractors")
      .update(contractorUpdate)
      .eq("id", body.contractorId)
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

  if (!membership.isAdmin) {
    return NextResponse.json({ error: "Admin access required to delete contractors" }, { status: 403 })
  }

  const { contractorId, contactId } = await req.json()
  if (!contractorId || !contactId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

  await service.from("contractors").delete().eq("id", contractorId).eq("org_id", membership.org_id)
  await service.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId).eq("org_id", membership.org_id)

  return NextResponse.json({ ok: true })
}
