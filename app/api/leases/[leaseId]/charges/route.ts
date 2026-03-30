import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: charges } = await supabase
    .from("lease_charges")
    .select("*, contractors(name)")
    .eq("lease_id", leaseId)
    .eq("is_active", true)
    .order("charge_type")

  return NextResponse.json({ charges: charges ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json()
  const {
    description, charge_type, amount_cents, start_date, end_date,
    payable_to, payable_to_contractor_id, deduct_from_owner_payment,
    vat_applicable,
  } = body

  if (!description?.trim() || !amount_cents || !start_date) {
    return NextResponse.json({ error: "Description, amount, and start date are required" }, { status: 400 })
  }

  const { data, error } = await supabase.from("lease_charges").insert({
    org_id: membership.org_id,
    lease_id: leaseId,
    description: description.trim(),
    charge_type: charge_type || "other",
    amount_cents: Number(amount_cents),
    start_date,
    end_date: end_date || null,
    payable_to: payable_to || "landlord",
    payable_to_contractor_id: payable_to_contractor_id || null,
    deduct_from_owner_payment: deduct_from_owner_payment ?? false,
    vat_applicable: vat_applicable ?? false,
    created_by: user.id,
  }).select("id").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: membership.org_id,
    table_name: "lease_charges",
    record_id: data?.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { description, charge_type, amount_cents, lease_id: leaseId },
  })

  return NextResponse.json({ ok: true, id: data?.id })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { chargeId } = await req.json()
  if (!chargeId) return NextResponse.json({ error: "chargeId required" }, { status: 400 })

  // Soft deactivate (don't delete — historical invoices reference it)
  await supabase
    .from("lease_charges")
    .update({ is_active: false })
    .eq("id", chargeId)
    .eq("lease_id", leaseId)

  return NextResponse.json({ ok: true })
}
