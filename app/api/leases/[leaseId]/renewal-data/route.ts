/**
 * app/api/leases/[leaseId]/renewal-data/route.ts — renewal-form seed data (escalated rent) for a lease
 *
 * Route:  GET /api/leases/[leaseId]/renewal-data
 * Auth:   gateway() (agent session + org membership)
 * Data:   leases, org-scoped via gateway orgId. leaseId is caller-supplied → filtered by org_id.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("unit_id, property_id, tenant_id, lease_type, rent_amount_cents, deposit_amount_cents, escalation_percent, payment_due_day, escalation_type")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  logQueryError("GET leases", leaseError)

  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

  // Calculate escalated rent for renewal
  const escalatedRent = Math.round(
    (lease.rent_amount_cents ?? 0) * (1 + (lease.escalation_percent ?? 10) / 100)
  )

  return NextResponse.json({
    unit_id: lease.unit_id,
    property_id: lease.property_id,
    tenant_id: lease.tenant_id,
    lease_type: lease.lease_type,
    rent_amount: escalatedRent / 100, // Return in rands for the form
    deposit_amount: (lease.deposit_amount_cents ?? 0) / 100,
    escalation_percent: lease.escalation_percent,
    payment_due_day: lease.payment_due_day,
  })
}
