import { createServiceClient } from "@/lib/supabase/server"
import { getTrustBalance, type TrustBalanceSummary } from "@/lib/dashboard/trustBalance"

export type { TrustBalanceSummary }

export interface TenantBalance {
  tenant_id: string
  tenant_name: string
  property_name: string
  unit_number: string
  balance_cents: number
  oldest_unpaid_days: number | null
  status: "clear" | "owing" | "arrears"
}

export interface OwnerBalance {
  landlord_id: string
  owner_name: string
  property_count: number
  owed_to_owner_cents: number
  payout_status: "pending" | "partial" | "paid"
}

export interface PropertyPerf {
  property_id: string
  property_name: string
  income_cents: number
  expenses_cents: number
  net_cents: number
  occupancy_percent: number
  unit_count: number
}

export interface UnmatchedLine {
  id: string
  transaction_date: string
  description_clean: string
  amount_cents: number
  age_days: number
  import_source: string
}

export interface FinanceHubData {
  trust: TrustBalanceSummary
  tenantBalances: TenantBalance[]
  ownerBalances: OwnerBalance[]
  propertyPerformance: PropertyPerf[]
  unmatchedLines: UnmatchedLine[]
}

type ContactRow = { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string }

function contactName(c: ContactRow | null): string {
  if (!c) return "Unknown"
  if (c.entity_type === "company") return c.company_name ?? "Unknown"
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unknown"
}

function currentPeriodMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

function formatImportSource(detectedBank: string | null, filename: string): string {
  if (detectedBank && detectedBank !== "other") {
    return detectedBank.replace(/_/g, " ").toUpperCase()
  }
  const ext = filename.split(".").pop()?.toLowerCase()
  if (ext === "csv") return "CSV upload"
  if (ext === "ofx" || ext === "qif") return `${ext.toUpperCase()} upload`
  return "Statement upload"
}

async function fetchTenantBalances(db: Awaited<ReturnType<typeof createServiceClient>>, orgId: string): Promise<TenantBalance[]> {
  const { data, error } = await db
    .from("rent_invoices")
    .select("tenant_id, unit_id, total_amount_cents, amount_paid_cents, balance_cents, due_date, tenants(contacts(first_name, last_name, company_name, entity_type)), units(unit_number, properties(name))")
    .eq("org_id", orgId)
    .not("status", "in", "(paid,cancelled,credit)")
    .gt("balance_cents", 0)

  if (error) {
    console.error("financeHub tenantBalances:", error.message)
    return []
  }

  type Row = {
    tenant_id: string
    unit_id: string
    total_amount_cents: number
    amount_paid_cents: number
    balance_cents: number
    due_date: string
    tenants: { contacts: ContactRow | null } | null
    units: { unit_number: string; properties: { name: string } | null } | null
  }

  // Aggregate per tenant — take worst status, latest unit info, sum balances
  const byTenant = new Map<string, { balance: number; oldestDue: string | null; name: string; unit: string; property: string }>()

  for (const row of (data ?? []) as unknown as Row[]) {
    const entry = byTenant.get(row.tenant_id)
    const name = contactName((row.tenants as { contacts: ContactRow | null } | null)?.contacts ?? null)
    const unit = row.units?.unit_number ?? "—"
    const property = row.units?.properties?.name ?? "—"
    const oldest = entry?.oldestDue == null || row.due_date < entry.oldestDue ? row.due_date : entry.oldestDue

    byTenant.set(row.tenant_id, {
      balance: (entry?.balance ?? 0) + (row.balance_cents ?? 0),
      oldestDue: oldest,
      name: entry?.name ?? name,
      unit: entry?.unit ?? unit,
      property: entry?.property ?? property,
    })
  }

  const today = new Date().toISOString().slice(0, 10)

  return Array.from(byTenant.entries())
    .map(([tenant_id, t]) => {
      const days = t.oldestDue ? daysSince(t.oldestDue) : null
      let status: TenantBalance["status"] = "owing"
      if (t.balance === 0) status = "clear"
      else if ((days ?? 0) >= 30) status = "arrears"
      return {
        tenant_id,
        tenant_name: t.name,
        property_name: t.property,
        unit_number: t.unit,
        balance_cents: t.balance,
        oldest_unpaid_days: t.oldestDue ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.oldestDue).getTime()) / 86_400_000)) : null,
        status,
      }
    })
    .sort((a, b) => b.balance_cents - a.balance_cents)
}

async function fetchOwnerBalances(db: Awaited<ReturnType<typeof createServiceClient>>, orgId: string): Promise<OwnerBalance[]> {
  const { data, error } = await db
    .from("owner_statements")
    .select("landlord_id, property_id, net_to_owner_cents, owner_payment_status, owner_payment_cents, landlords(contacts(first_name, last_name, company_name, entity_type))")
    .eq("org_id", orgId)
    .eq("period_month", currentPeriodMonth())

  if (error) {
    console.error("financeHub ownerBalances:", error.message)
    return []
  }

  type Row = {
    landlord_id: string | null
    property_id: string
    net_to_owner_cents: number
    owner_payment_status: string
    owner_payment_cents: number | null
    landlords: { contacts: ContactRow | null } | null
  }

  const byLandlord = new Map<string, { owed: number; properties: Set<string>; name: string; statuses: string[] }>()

  for (const row of (data ?? []) as unknown as Row[]) {
    const lid = row.landlord_id ?? "unknown"
    const name = contactName((row.landlords as { contacts: ContactRow | null } | null)?.contacts ?? null)
    let paidOut = 0
    if (row.owner_payment_status === "partial") paidOut = row.owner_payment_cents ?? 0
    else if (row.owner_payment_status === "paid") paidOut = row.net_to_owner_cents
    const owed = (row.net_to_owner_cents ?? 0) - paidOut

    const entry = byLandlord.get(lid)
    byLandlord.set(lid, {
      owed: (entry?.owed ?? 0) + owed,
      properties: (entry?.properties ?? new Set()).add(row.property_id),
      name: entry?.name ?? name,
      statuses: [...(entry?.statuses ?? []), row.owner_payment_status],
    })
  }

  return Array.from(byLandlord.entries())
    .filter(([, t]) => t.owed > 0)
    .map(([landlord_id, t]) => {
      const allPaid = t.statuses.every((s) => s === "paid")
      const anyPartial = t.statuses.some((s) => s === "partial")
      let payout_status: OwnerBalance["payout_status"] = "pending"
      if (allPaid) payout_status = "paid"
      else if (anyPartial) payout_status = "partial"
      return {
        landlord_id,
        owner_name: t.name,
        property_count: t.properties.size,
        owed_to_owner_cents: t.owed,
        payout_status,
      }
    })
    .sort((a, b) => b.owed_to_owner_cents - a.owed_to_owner_cents)
}

async function fetchPropertyPerformance(db: Awaited<ReturnType<typeof createServiceClient>>, orgId: string): Promise<PropertyPerf[]> {
  const periodMonth = currentPeriodMonth()

  const [{ data: stmts, error: stmtErr }, { data: units, error: unitErr }] = await Promise.all([
    db
      .from("owner_statements")
      .select("property_id, gross_income_cents, total_expenses_cents, net_to_owner_cents, properties(name)")
      .eq("org_id", orgId)
      .eq("period_month", periodMonth),
    db
      .from("units")
      .select("id, property_id, leases(status)")
      .eq("org_id", orgId)
      .is("deleted_at", null),
  ])

  if (stmtErr) console.error("financeHub propertyPerf stmts:", stmtErr.message)
  if (unitErr) console.error("financeHub propertyPerf units:", unitErr.message)

  type StmtRow = {
    property_id: string
    gross_income_cents: number
    total_expenses_cents: number
    net_to_owner_cents: number
    properties: { name: string } | null
  }

  type UnitRow = {
    id: string
    property_id: string
    leases: { status: string }[]
  }

  const ACTIVE_STATUSES = new Set(["active", "notice", "month_to_month"])

  // Aggregate income/expenses per property from statements
  const byProperty = new Map<string, { income: number; expenses: number; net: number; name: string }>()
  for (const s of (stmts ?? []) as unknown as StmtRow[]) {
    const entry = byProperty.get(s.property_id)
    byProperty.set(s.property_id, {
      income: (entry?.income ?? 0) + (s.gross_income_cents ?? 0),
      expenses: (entry?.expenses ?? 0) + (s.total_expenses_cents ?? 0),
      net: (entry?.net ?? 0) + (s.net_to_owner_cents ?? 0),
      name: entry?.name ?? ((s.properties as { name: string } | null)?.name ?? "—"),
    })
  }

  // Count total units and occupied units per property
  const unitCount = new Map<string, number>()
  const occupiedCount = new Map<string, number>()
  for (const u of (units ?? []) as unknown as UnitRow[]) {
    unitCount.set(u.property_id, (unitCount.get(u.property_id) ?? 0) + 1)
    const isOccupied = ((u.leases as { status: string }[]) ?? []).some((l) => ACTIVE_STATUSES.has(l.status))
    if (isOccupied) occupiedCount.set(u.property_id, (occupiedCount.get(u.property_id) ?? 0) + 1)
  }

  return Array.from(byProperty.entries()).map(([property_id, p]) => {
    const total = unitCount.get(property_id) ?? 0
    const occupied = occupiedCount.get(property_id) ?? 0
    return {
      property_id,
      property_name: p.name,
      income_cents: p.income,
      expenses_cents: p.expenses,
      net_cents: p.net,
      occupancy_percent: total > 0 ? Math.round((occupied / total) * 100) : 0,
      unit_count: total,
    }
  })
}

async function fetchUnmatchedLines(db: Awaited<ReturnType<typeof createServiceClient>>, orgId: string): Promise<UnmatchedLine[]> {
  const { data, error } = await db
    .from("bank_statement_lines")
    .select("id, transaction_date, description_clean, description_raw, amount_cents, bank_statement_imports(detected_bank, original_filename)")
    .eq("org_id", orgId)
    .eq("match_status", "unmatched")
    .order("transaction_date", { ascending: true })
    .limit(5)

  if (error) {
    console.error("financeHub unmatchedLines:", error.message)
    return []
  }

  type Row = {
    id: string
    transaction_date: string
    description_clean: string | null
    description_raw: string
    amount_cents: number
    bank_statement_imports: { detected_bank: string | null; original_filename: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    transaction_date: r.transaction_date,
    description_clean: r.description_clean ?? r.description_raw,
    amount_cents: r.amount_cents,
    age_days: daysSince(r.transaction_date),
    import_source: formatImportSource(
      (r.bank_statement_imports as { detected_bank: string | null; original_filename: string } | null)?.detected_bank ?? null,
      (r.bank_statement_imports as { detected_bank: string | null; original_filename: string } | null)?.original_filename ?? "statement",
    ),
  }))
}

export async function getFinanceHubData(orgId: string): Promise<FinanceHubData> {
  const db = await createServiceClient()

  const [trust, tenantBalances, ownerBalances, propertyPerformance, unmatchedLines] = await Promise.all([
    getTrustBalance(orgId),
    fetchTenantBalances(db, orgId),
    fetchOwnerBalances(db, orgId),
    fetchPropertyPerformance(db, orgId),
    fetchUnmatchedLines(db, orgId),
  ])

  return { trust, tenantBalances, ownerBalances, propertyPerformance, unmatchedLines }
}
