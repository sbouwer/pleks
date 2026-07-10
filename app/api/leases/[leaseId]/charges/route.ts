/**
 * app/api/leases/[leaseId]/charges/route.ts — CRUD for lease additional charges
 *
 * Route:  GET/POST/DELETE /api/leases/[leaseId]/charges
 * Auth:   GET → gateway() (read). POST (add charge) / DELETE (soft-deactivate charge) →
 *         requireAgentWriteAccess — a lease charge is a financial obligation (net-new value), so writes
 *         are subscription-lockdown gated.
 * Data:   lease_charges, audit_log, communication_log (L6 comm on POST/DELETE). All org-scoped.
 * Notes:  POST fires lease.amended comm (L6) to the tenant when a charge is added to an active lease;
 *         DELETE fires L6 with changeType="removed". Lockdown surfaces as a clean 403, never a 500.
 */
import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import * as React from "react"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { LeaseAmendedEmail } from "@/lib/comms/templates/tenant/leases/lease-amended"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { saTodayISO } from "@/lib/dates"

type ChargeComm = { description: string; amountCents: number; dateStr: string; changeType: "added" | "removed" }

async function fireLeaseAmendedComm(
  db: SupabaseClient,
  leaseId: string,
  orgId: string,
  userId: string,
  charge: ChargeComm,
): Promise<void> {
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("status, tenant_id, unit_id")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  logQueryError("fireLeaseAmendedComm leases", leaseError)
  if (lease?.status !== "active" || !lease.tenant_id) return

  const [tenantRes, unitRes, orgSettings] = await Promise.all([
    db.from("tenant_view").select("first_name, last_name, email, phone").eq("id", lease.tenant_id).eq("org_id", orgId).single(),
    db.from("units").select("unit_number, properties(name)").eq("id", lease.unit_id).eq("org_id", orgId).single(),
    fetchOrgSettings(orgId),
  ])
  const tenant = tenantRes.data
  const unit = unitRes.data as unknown as { unit_number: string; properties: { name: string } } | null
  if (!tenant?.email) return

  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
  const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
  const chargeAmountDisplay = "R " + (charge.amountCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
  const effectiveDateDisplay = new Date(charge.dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const action = charge.changeType === "removed" ? "charge removed" : "new charge added"

  await routeAndSend({
    orgId,
    tenantId: lease.tenant_id as string,
    templateKey: "lease.amended",
    to: { email: tenant.email, phone: tenant.phone ?? undefined, name: tenantName },
    subject: `Lease update - ${action} - ${propertyLabel}`,
    emailElement: React.createElement(LeaseAmendedEmail, {
      branding: buildBranding(orgSettings),
      tenantName,
      propertyLabel,
      chargeDescription: charge.description,
      chargeAmountDisplay,
      effectiveDate: effectiveDateDisplay,
      changeType: charge.changeType,
      senderName: orgSettings?.name ?? "Pleks",
    }),
    entityType: "lease",
    entityId: leaseId,
    triggeredBy: userId,
    triggerEventType: "lease_state",
    triggerEventId: leaseId,
    toneVariant: "n/a",
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: charges, error: chargesError } = await db
    .from("lease_charges")
    .select("*, contractor_view(first_name, last_name, company_name)")
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("charge_type")
  logQueryError("GET lease_charges", chargesError)

  return NextResponse.json({ charges: charges ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  let gw
  try {
    gw = await requireAgentWriteAccess("add_lease_charge")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, userId, orgId } = gw

  const body = await req.json()
  const {
    description, charge_type, amount_cents, start_date, end_date,
    payable_to, payable_to_contractor_id, deduct_from_owner_payment,
    vat_applicable,
  } = body

  if (!description?.trim() || !amount_cents || !start_date) {
    return NextResponse.json({ error: "Description, amount, and start date are required" }, { status: 400 })
  }

  const { data, error } = await db.from("lease_charges").insert({
    org_id: orgId,
    lease_id: leaseId,
    description: description.trim(),
    charge_type: charge_type || "other",
    amount_cents: Number(amount_cents),
    start_date,
    end_date: end_date || null,
    payable_to: payable_to || "landlord",
    payable_to_supplier_id: payable_to_contractor_id || null,
    deduct_from_owner_payment: deduct_from_owner_payment ?? false,
    vat_applicable: vat_applicable ?? false,
    created_by: userId,
  }).select("id").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "lease_charges",
    record_id: data?.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { description, charge_type, amount_cents, lease_id: leaseId },
  })

  // L6 — lease.amended comm (charge added)
  try {
    await fireLeaseAmendedComm(db, leaseId, orgId, userId, {
      description: description.trim(),
      amountCents: Number(amount_cents),
      dateStr: start_date,
      changeType: "added",
    })
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
  let gw
  try {
    gw = await requireAgentWriteAccess("remove_lease_charge")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, userId, orgId } = gw

  const { chargeId } = await req.json()
  if (!chargeId) return NextResponse.json({ error: "chargeId required" }, { status: 400 })

  // Fetch charge before deactivating (need description/amount for L6 comm)
  const { data: charge, error: chargeError } = await db
    .from("lease_charges")
    .select("description, amount_cents, start_date")
    .eq("id", chargeId)
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .single()
  logQueryError("DELETE lease_charges", chargeError)

  // Soft deactivate (don't delete — historical invoices reference it)
  await db
    .from("lease_charges")
    .update({ is_active: false })
    .eq("id", chargeId)
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "lease_charges",
    record_id: chargeId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { is_active: false, lease_id: leaseId },
  })

  // L6 — lease.amended comm (charge removed)
  if (charge) {
    try {
      await fireLeaseAmendedComm(db, leaseId, orgId, userId, {
        description: charge.description,
        amountCents: Number(charge.amount_cents),
        dateStr: saTodayISO(),
        changeType: "removed",
      })
    } catch {
      // Comm failure is non-fatal
    }
  }

  return NextResponse.json({ ok: true })
}
