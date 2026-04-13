import { createServiceClient } from "@/lib/supabase/server"
import type { DepositRegisterData, DepositRegisterRow, ReportFilters } from "./types"

export async function buildDepositRegister(filters: ReportFilters): Promise<DepositRegisterData> {
  const db = await createServiceClient()
  const { orgId } = filters

  const { data, error } = await db
    .from("deposit_transactions")
    .select("id, tenant_id, amount_cents, direction, transaction_type, transaction_date, leases(units(unit_number, properties(name))), tenants(contacts(first_name, last_name, company_name, entity_type))")
    .eq("org_id", orgId)
    .in("transaction_type", ["deposit_received", "deposit_interest"])
    .order("transaction_date", { ascending: false })

  if (error) console.error("depositRegister:", error.message)

  const txns = data ?? []

  // Sum credits minus debits to get currently held per tenant
  const holdMap = new Map<string, { amount: number; date: string; tenantName: string; unit: string; property: string }>()

  for (const t of txns) {
    const tid = t.tenant_id as string
    const tenantRaw = t.tenants as unknown as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null } | null
    const tc = tenantRaw?.contacts
    const tenantName = tc?.entity_type === "company"
      ? (tc.company_name ?? "Tenant")
      : `${tc?.first_name ?? ""} ${tc?.last_name ?? ""}`.trim() || "Tenant"
    const leaseRaw = t.leases as unknown as { units: { unit_number: string; properties: { name: string } | null } | null } | null
    const unitNumber = leaseRaw?.units?.unit_number ?? "—"
    const propName = leaseRaw?.units?.properties?.name ?? "—"

    const existing = holdMap.get(tid) ?? { amount: 0, date: t.transaction_date as string, tenantName, unit: unitNumber, property: propName }
    const delta = t.direction === "credit" ? (t.amount_cents as number) : -(t.amount_cents as number)
    holdMap.set(tid, { ...existing, amount: existing.amount + delta })
  }

  const rows: DepositRegisterRow[] = []
  for (const [, v] of holdMap) {
    if (v.amount <= 0) continue
    rows.push({
      tenant_name: v.tenantName,
      unit_number: v.unit,
      property_name: v.property,
      amount_cents: v.amount,
      date_received: v.date,
      status: "held",
    })
  }

  rows.sort((a, b) => a.property_name.localeCompare(b.property_name))

  return {
    as_at: new Date(),
    rows,
    total_held_cents: rows.reduce((s, r) => s + r.amount_cents, 0),
    count: rows.length,
  }
}
