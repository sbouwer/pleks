import { getCachedServiceClient } from "@/lib/supabase/server"

export interface UnpaidOwnerRow {
  statement_id: string
  owner_name: string
  property_name: string
  net_to_owner_cents: number
  owner_payment_status: string
  days_since_statement: number
  owner_payment_notes: string | null
}

export interface UnpaidOwnersData {
  rows: UnpaidOwnerRow[]
  total_unpaid_cents: number
  count: number
}

export async function getUnpaidOwners(orgId: string, periodMonth?: Date): Promise<UnpaidOwnersData> {
  const supabase = await getCachedServiceClient()

  const now = new Date()
  const month = periodMonth ?? new Date(now.getFullYear(), now.getMonth(), 1)

  const { data: statements } = await supabase
    .from("owner_statements")
    .select(`
      id, property_id, net_to_owner_cents, owner_payment_status,
      owner_payment_notes, generated_at,
      properties(name, owner_id)
    `)
    .eq("org_id", orgId)
    .gte("period_from", month.toISOString())
    .in("owner_payment_status", ["pending", "on_hold", "partial"])
    .order("net_to_owner_cents", { ascending: false })

  const stmts = statements ?? []

  // Resolve owner names
  const ownerIds = stmts
    .map((s) => (s.properties as unknown as { owner_id: string } | null)?.owner_id)
    .filter(Boolean)

  const ownerNames = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("landlord_view")
      .select("id, first_name, last_name, company_name")
      .in("id", ownerIds)

    for (const o of owners ?? []) {
      ownerNames.set(o.id, o.company_name ?? `${o.first_name} ${o.last_name}`)
    }
  }

  const rows: UnpaidOwnerRow[] = stmts.map((s) => {
    const prop = s.properties as unknown as { name: string; owner_id: string } | null
    const ownerId = prop?.owner_id ?? ""
    const genDate = s.generated_at ? new Date(s.generated_at) : now
    const daysSince = Math.floor((now.getTime() - genDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      statement_id: s.id,
      owner_name: ownerNames.get(ownerId) ?? prop?.name ?? "Unknown",
      property_name: prop?.name ?? "",
      net_to_owner_cents: s.net_to_owner_cents ?? 0,
      owner_payment_status: s.owner_payment_status,
      days_since_statement: daysSince,
      owner_payment_notes: s.owner_payment_notes,
    }
  })

  return {
    rows,
    total_unpaid_cents: rows.reduce((s, r) => s + r.net_to_owner_cents, 0),
    count: rows.length,
  }
}
