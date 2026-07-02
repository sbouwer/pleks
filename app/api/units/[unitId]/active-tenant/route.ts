/**
 * app/api/units/[unitId]/active-tenant/route.ts — resolve the tenant currently tied to a unit
 *
 * Route:  GET /api/units/[unitId]/active-tenant
 * Auth:   gateway() (agent session + org membership)
 * Data:   leases + units, org-scoped via the gateway orgId. unitId is caller-supplied, so BOTH
 *         lookups filter org_id — the service client bypasses RLS, so the filter is the boundary.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

// Lease statuses that indicate a tenant is associated with this unit
const TENANT_STATUSES = ["draft", "pending_signing", "active", "notice", "month_to_month"]

export async function GET(_req: Request, { params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params

  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  // Try to find the most recent non-cancelled lease with a tenant
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("id, tenant_id, tenant_view(first_name, last_name, phone)")
    .eq("unit_id", unitId)
    .eq("org_id", orgId)
    .in("status", TENANT_STATUSES)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  logQueryError("GET leases", leaseError)

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
  const { data: unit, error: unitError } = await db
    .from("units")
    .select("prospective_tenant_id, tenant_view:prospective_tenant_id(first_name, last_name, phone)")
    .eq("id", unitId)
    .eq("org_id", orgId)
    .single()
  logQueryError("GET units", unitError)

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
