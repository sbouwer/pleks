/**
 * app/api/deposits/[leaseId]/schedule-pdf/route.ts — renders the deposit deduction schedule as HTML (for PDF)
 *
 * Route:  GET /api/deposits/[leaseId]/schedule-pdf
 * Auth:   gateway() (agent session + org membership)
 * Data:   deposit_reconciliations / leases / deposit_deduction_items / deposit_timers by leaseId.
 * Notes:  leaseId is caller-supplied — the gating recon + lease lookups filter org_id (service client
 *         bypasses RLS), so a cross-org leaseId 404s before any deposit data is rendered. Items/timer
 *         are then read by lease_id only, safe because the lease is already confirmed in-org.
 */
import { NextRequest } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { buildDeductionScheduleHTML } from "@/lib/deposits/generateSchedulePDF"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const gw = await gateway()
  if (!gw) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  // Get reconciliation (org-scoped — the boundary for the caller-supplied leaseId)
  const { data: recon, error: reconError } = await db
    .from("deposit_reconciliations")
    .select("*")
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (reconError) console.error("schedule-pdf deposit_reconciliations read failed:", reconError.message)
  if (!recon) return Response.json({ error: "Not found" }, { status: 404 })

  // Get lease details (org-scoped)
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select(`
      start_date, end_date,
      units(unit_number, properties(name, address_line1, city)),
      tenant_view(first_name, last_name)
    `)
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  if (leaseError) console.error("schedule-pdf leases read failed:", leaseError.message)

  const unit = lease?.units as unknown as { unit_number: string; properties: { name: string; address_line1: string; city: string } | null } | null
  const tenant = lease?.tenant_view as unknown as { first_name: string; last_name: string } | null

  // Get org name for the header
  const { data: org, error: orgError } = await db
    .from("organisations")
    .select("name")
    .eq("id", orgId)
    .single()
  if (orgError) console.error("schedule-pdf organisations read failed:", orgError.message)

  const orgName = org?.name ?? ""

  // Get deduction items (lease already confirmed in-org via recon)
  const { data: items, error: itemsError } = await db
    .from("deposit_deduction_items")
    .select("room, item_description, classification, deduction_amount_cents, ai_justification, quote_amount_cents")
    .eq("lease_id", leaseId)
    .order("created_at")
  if (itemsError) console.error("schedule-pdf deposit_deduction_items read failed:", itemsError.message)

  // Get timer
  const { data: timer, error: timerError } = await db
    .from("deposit_timers")
    .select("deadline, return_days")
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (timerError) console.error("schedule-pdf deposit_timers read failed:", timerError.message)

  const propertyAddress = [
    unit?.unit_number,
    unit?.properties?.name ?? unit?.properties?.address_line1,
    unit?.properties?.city,
  ].filter(Boolean).join(", ")

  const html = buildDeductionScheduleHTML({
    property_address: propertyAddress,
    landlord_name: "Property Owner",
    org_name: orgName,
    tenant_name: tenant ? `${tenant.first_name} ${tenant.last_name}` : "Tenant",
    lease_start: new Date(lease?.start_date ?? ""),
    lease_end: new Date(lease?.end_date ?? ""),
    vacated_date: new Date(lease?.end_date ?? ""),
    deposit_held_cents: recon.deposit_held_cents,
    interest_accrued_cents: recon.interest_accrued_cents,
    total_available_cents: recon.total_available_cents,
    total_deductions_cents: recon.total_deductions_cents,
    refund_to_tenant_cents: recon.refund_to_tenant_cents,
    return_days: timer?.return_days ?? 14,
    deadline: timer?.deadline ? new Date(timer.deadline) : new Date(),
    items: items ?? [],
  })

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
