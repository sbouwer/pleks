import { toDateStr } from "./periods"
import { createServiceClient } from "@/lib/supabase/server"
import type { TenantPaymentHistoryData, TenantPaymentHistoryRow, ReportFilters } from "./types"

export async function buildTenantPaymentHistory(filters: ReportFilters): Promise<TenantPaymentHistoryData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

  const leasesQuery = db
    .from("leases")
    .select("id, tenant_id, unit_id, rent_amount_cents, units(unit_number, property_id, properties(name))")
    .eq("org_id", orgId)
    .in("status", ["active", "notice", "month_to_month", "ended"])
  if (propertyIds?.length) {
    // filter by property via unit
  }
  const { data: leases, error: lErr } = await leasesQuery
  if (lErr) console.error("tenantPaymentHistory leases:", lErr.message)

  const leaseIds = (leases ?? []).map((l) => l.id)
  if (leaseIds.length === 0) {
    return { period: { from, to }, rows: [], total_invoiced_cents: 0, total_paid_cents: 0, total_outstanding_cents: 0 }
  }

  const [invoicesRes, paymentsRes] = await Promise.all([
    db.from("rent_invoices")
      .select("lease_id, tenant_id, total_amount_cents, amount_paid_cents")
      .eq("org_id", orgId)
      .in("lease_id", leaseIds)
      .gte("due_date", fromStr)
      .lte("due_date", toStr),
    db.from("payments")
      .select("lease_id, tenant_id, amount_cents, payment_date")
      .eq("org_id", orgId)
      .in("lease_id", leaseIds)
      .gte("payment_date", fromStr)
      .lte("payment_date", toStr),
  ])

  if (invoicesRes.error) console.error("tenantPaymentHistory invoices:", invoicesRes.error.message)
  if (paymentsRes.error) console.error("tenantPaymentHistory payments:", paymentsRes.error.message)

  // Group by tenant
  const tenantMap = new Map<string, { invoiced: number; paid: number; lastPayment: string | null; paymentCount: number; leaseId: string }>()
  for (const inv of invoicesRes.data ?? []) {
    const tid = inv.tenant_id as string
    const existing = tenantMap.get(tid) ?? { invoiced: 0, paid: 0, lastPayment: null, paymentCount: 0, leaseId: inv.lease_id as string }
    tenantMap.set(tid, { ...existing, invoiced: existing.invoiced + (inv.total_amount_cents ?? 0) })
  }
  for (const pay of paymentsRes.data ?? []) {
    const tid = pay.tenant_id as string
    const existing = tenantMap.get(tid) ?? { invoiced: 0, paid: 0, lastPayment: null, paymentCount: 0, leaseId: pay.lease_id as string }
    const payDate = pay.payment_date as string
    const lastPayment = existing.lastPayment && existing.lastPayment > payDate ? existing.lastPayment : payDate
    tenantMap.set(tid, { ...existing, paid: existing.paid + (pay.amount_cents ?? 0), lastPayment, paymentCount: existing.paymentCount + 1 })
  }

  const leaseMap = new Map((leases ?? []).map((l) => [l.id, l]))
  const tenantIds = Array.from(tenantMap.keys())
  const { data: tenants } = await db
    .from("tenant_view")
    .select("id, first_name, last_name, company_name, entity_type")
    .eq("org_id", orgId)
    .in("id", tenantIds)
  const tenantInfoMap = new Map((tenants ?? []).map((t) => [t.id, t]))

  const rows: TenantPaymentHistoryRow[] = []
  for (const [tid, v] of tenantMap) {
    const ti = tenantInfoMap.get(tid)
    const tenantName = ti?.entity_type === "company"
      ? (ti.company_name ?? "Tenant")
      : `${ti?.first_name ?? ""} ${ti?.last_name ?? ""}`.trim() || "Tenant"
    const lease = leaseMap.get(v.leaseId)
    const unitRaw = lease?.units as unknown as { unit_number: string; properties: { name: string } | null } | null
    rows.push({
      tenant_name: tenantName,
      unit_number: unitRaw?.unit_number ?? "—",
      property_name: unitRaw?.properties?.name ?? "—",
      total_invoiced_cents: v.invoiced,
      total_paid_cents: v.paid,
      balance_cents: v.invoiced - v.paid,
      last_payment_date: v.lastPayment,
      payment_count: v.paymentCount,
    })
  }

  rows.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name))

  return {
    period: { from, to },
    rows,
    total_invoiced_cents: rows.reduce((s, r) => s + r.total_invoiced_cents, 0),
    total_paid_cents: rows.reduce((s, r) => s + r.total_paid_cents, 0),
    total_outstanding_cents: rows.reduce((s, r) => s + r.balance_cents, 0),
  }
}
