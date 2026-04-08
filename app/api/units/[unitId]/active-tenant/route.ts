import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Lease statuses that indicate a tenant is associated with this unit
const TENANT_STATUSES = ["draft", "pending_signing", "active", "notice", "month_to_month"]

export async function GET(_req: Request, { params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Try to find the most recent non-cancelled lease with a tenant
  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_id, tenant_view(first_name, last_name, phone)")
    .eq("unit_id", unitId)
    .in("status", TENANT_STATUSES)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lease?.tenant_id) {
    const tv = lease.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null
    const tenant = tv
      ? {
          id: lease.tenant_id as string,
          name: `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim(),
          phone: tv.phone ?? null,
        }
      : null
    return NextResponse.json({ tenant, leaseId: lease.id })
  }

  // Fallback: check prospective_tenant_id on the unit itself
  const { data: unit } = await supabase
    .from("units")
    .select("prospective_tenant_id, tenant_view:prospective_tenant_id(first_name, last_name, phone)")
    .eq("id", unitId)
    .single()

  if (unit?.prospective_tenant_id) {
    const tv = unit.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null
    const tenant = tv
      ? {
          id: unit.prospective_tenant_id as string,
          name: `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim(),
          phone: tv.phone ?? null,
        }
      : null
    return NextResponse.json({ tenant, leaseId: null })
  }

  return NextResponse.json({ tenant: null, leaseId: null })
}
