import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
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

  const { data: leases } = await supabase
    .from("leases")
    .select("id, status, rent_amount_cents, units(unit_number, properties(name)), tenant_view(first_name, last_name)")
    .eq("org_id", membership.org_id)
    .in("status", ["active", "notice", "month_to_month", "expired"])
    .order("created_at", { ascending: false })

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
