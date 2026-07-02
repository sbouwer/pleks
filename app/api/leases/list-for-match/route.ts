/**
 * app/api/leases/list-for-match/route.ts — active/recent leases as labelled options for payment-match pickers
 *
 * Route:  GET /api/leases/list-for-match
 * Auth:   gateway() (agent session + org membership)
 * Data:   leases (org-scoped via gateway orgId) joined to units/properties/tenant_view for a display label.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: leases, error: leasesError } = await db
    .from("leases")
    .select("id, status, rent_amount_cents, units(unit_number, properties(name)), tenant_view(first_name, last_name)")
    .eq("org_id", orgId)
    .in("status", ["active", "notice", "month_to_month", "expired"])
    .order("created_at", { ascending: false })
  logQueryError("GET leases", leasesError)

  const mapped = (leases ?? []).map((l) => {
    const unit = l.units as unknown as { unit_number: string; properties: { name: string } } | null
    const tenant = l.tenant_view as unknown as { first_name: string; last_name: string } | null
    return {
      id: l.id,
      label: `${unit?.properties?.name ?? "?"} — ${unit?.unit_number ?? "?"} (${tenant?.first_name ?? ""} ${tenant?.last_name ?? ""})`.trim(),
      propertyName: unit?.properties?.name ?? "",
      unitNumber: unit?.unit_number ?? "",
      tenantName: `${tenant?.first_name ?? ""} ${tenant?.last_name ?? ""}`.trim(),
    }
  })

  return NextResponse.json({ leases: mapped })
}
