import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(_req: Request, { params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_id, tenant_view(first_name, last_name, phone)")
    .eq("unit_id", unitId)
    .in("status", ["active", "signed"])
    .order("start_date", { ascending: false })
    .limit(1)
    .single()

  if (!lease) return NextResponse.json({ tenant: null, leaseId: null })

  const tv = lease.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null
  const tenant = tv && lease.tenant_id
    ? {
        id: lease.tenant_id as string,
        name: `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim(),
        phone: tv.phone ?? null,
      }
    : null

  return NextResponse.json({ tenant, leaseId: lease.id })
}
