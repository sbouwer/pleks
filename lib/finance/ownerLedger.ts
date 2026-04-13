import { createServiceClient } from "@/lib/supabase/server"

type SupabaseServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface OwnerLedgerEntry {
  id: string
  date: string
  ref: string | null
  type: string
  property_name: string
  in_cents: number
  out_cents: number
}

export interface OwnerLedgerResult {
  entries: OwnerLedgerEntry[]
  propertyNames: Record<string, string>
  propertyCount: number
  statementCount: number
}

export async function getOwnerLedger(
  db: SupabaseServiceClient,
  orgId: string,
  landlordId: string,
  filters: { from?: string; to?: string; propertyId?: string } = {},
): Promise<OwnerLedgerResult> {
  const { data: properties, error: propErr } = await db
    .from("properties")
    .select("id, name")
    .eq("landlord_id", landlordId)
    .eq("org_id", orgId)
    .is("deleted_at", null)

  if (propErr) console.error("ownerLedger properties:", propErr.message)

  const allProperties = properties ?? []
  const propertyNames: Record<string, string> = {}
  for (const p of allProperties) { propertyNames[p.id] = p.name }

  const candidateIds = filters.propertyId
    ? allProperties.filter((p) => p.id === filters.propertyId).map((p) => p.id)
    : allProperties.map((p) => p.id)

  if (candidateIds.length === 0) {
    return { entries: [], propertyNames, propertyCount: allProperties.length, statementCount: 0 }
  }

  let query = db
    .from("owner_statements")
    .select("id, period_month, period_from, period_to, gross_income_cents, total_expenses_cents, management_fee_cents, management_fee_vat_cents, net_to_owner_cents, owner_payment_status, owner_payment_date, property_id")
    .eq("org_id", orgId)
    .in("property_id", candidateIds)
    .order("period_from", { ascending: true })

  if (filters.from) query = query.gte("period_from", filters.from)
  if (filters.to) query = query.lte("period_to", filters.to)

  const { data: statements, error: stmtErr } = await query
  if (stmtErr) console.error("ownerLedger statements:", stmtErr.message)

  const rawEntries: OwnerLedgerEntry[] = []
  for (const s of statements ?? []) {
    const propName = propertyNames[s.property_id] ?? "Unknown"
    const period = s.period_from ? s.period_from.slice(0, 7) : (s.period_month?.slice(0, 7) ?? "")

    if (s.gross_income_cents > 0) {
      rawEntries.push({
        id: `inc-${s.id}`,
        date: s.period_from ?? s.period_month ?? "",
        ref: null,
        type: "Rent collected",
        property_name: propName,
        in_cents: s.gross_income_cents,
        out_cents: 0,
      })
    }

    const totalExpenses = (s.total_expenses_cents ?? 0) + (s.management_fee_cents ?? 0) + (s.management_fee_vat_cents ?? 0)
    if (totalExpenses > 0) {
      rawEntries.push({
        id: `exp-${s.id}`,
        date: s.period_from ?? s.period_month ?? "",
        ref: null,
        type: "Expenses & fees",
        property_name: propName,
        in_cents: 0,
        out_cents: totalExpenses,
      })
    }

    if (s.owner_payment_status === "paid" && s.net_to_owner_cents > 0) {
      rawEntries.push({
        id: `pay-${s.id}`,
        date: s.owner_payment_date ?? s.period_from ?? "",
        ref: `STMT-${period}`,
        type: "Owner payout",
        property_name: propName,
        in_cents: 0,
        out_cents: s.net_to_owner_cents,
      })
    }
  }

  rawEntries.sort((a, b) => a.date.localeCompare(b.date))

  return {
    entries: rawEntries,
    propertyNames,
    propertyCount: allProperties.length,
    statementCount: statements?.length ?? 0,
  }
}
