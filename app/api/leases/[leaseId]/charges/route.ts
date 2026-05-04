/**
 * app/api/leases/[leaseId]/charges/route.ts — CRUD for lease additional charges
 *
 * Route:  /api/leases/[leaseId]/charges
 * Auth:   Supabase auth.getUser() + user_orgs membership check
 * Data:   lease_charges, audit_log, communication_log (L6 on POST)
 * Notes:  POST fires lease.amended comm (L6) to tenant when a charge is added to an active lease.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import * as React from "react"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { LeaseAmendedEmail } from "@/lib/comms/templates/tenant/leases/lease-amended"

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
    .select("*, contractor_view(first_name, last_name, company_name)")
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

  // L6 — lease.amended comm: only fire when the lease is active and tenant has email
  try {
    const { data: lease } = await supabase
      .from("leases")
      .select("status, tenant_id, unit_id")
      .eq("id", leaseId)
      .single()
    if (lease?.status === "active" && lease.tenant_id) {
      const [tenantRes, unitRes, orgSettings] = await Promise.all([
        supabase.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).single(),
        supabase.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).single(),
        fetchOrgSettings(membership.org_id),
      ])
      const tenant = tenantRes.data
      const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null
      if (tenant?.email) {
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
        const chargeAmountDisplay = "R " + (Number(amount_cents) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
        const effectiveDateDisplay = new Date(start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
        await routeAndSend({
          orgId: membership.org_id,
          tenantId: lease.tenant_id as string,
          templateKey: "lease.amended",
          to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
          subject: `Lease update — new charge added — ${propertyLabel}`,
          emailElement: React.createElement(LeaseAmendedEmail, {
            branding: buildBranding(orgSettings),
            tenantName,
            propertyLabel,
            chargeDescription: description.trim(),
            chargeAmountDisplay,
            effectiveDate: effectiveDateDisplay,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "lease",
          entityId: leaseId,
          triggeredBy: user.id,
          triggerEventType: "lease_state",
          triggerEventId: leaseId,
          toneVariant: "n/a",
        })
      }
    }
  } catch {
    // Comm failure is non-fatal
  }

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
