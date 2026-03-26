import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: lease } = await supabase
    .from("leases")
    .select("unit_id, property_id, tenant_id, lease_type, rent_amount_cents, deposit_amount_cents, escalation_percent, payment_due_day, escalation_type")
    .eq("id", leaseId)
    .single()

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
