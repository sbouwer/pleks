import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildDeductionScheduleHTML } from "@/lib/deposits/generateSchedulePDF"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Get reconciliation
  const { data: recon } = await supabase
    .from("deposit_reconciliations")
    .select("*")
    .eq("lease_id", leaseId)
    .single()

  if (!recon) return Response.json({ error: "Not found" }, { status: 404 })

  // Get lease details
  const { data: lease } = await supabase
    .from("leases")
    .select(`
      start_date, end_date,
      units(unit_number, properties(name, address_line1, city)),
      tenants(first_name, last_name)
    `)
    .eq("id", leaseId)
    .single()

  const unit = lease?.units as unknown as { unit_number: string; properties: { name: string; address_line1: string; city: string } | null } | null
  const tenant = lease?.tenants as unknown as { first_name: string; last_name: string } | null

  // Get org
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("organisations(name)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  const orgName = (membership?.organisations as unknown as { name: string } | null)?.name ?? ""

  // Get deduction items
  const { data: items } = await supabase
    .from("deposit_deduction_items")
    .select("room, item_description, classification, deduction_amount_cents, ai_justification, quote_amount_cents")
    .eq("lease_id", leaseId)
    .order("created_at")

  // Get timer
  const { data: timer } = await supabase
    .from("deposit_timers")
    .select("deadline, return_days")
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

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
