import { createServiceClient } from "@/lib/supabase/server"
import type { ArrearsAgingData, ArrearsAgingRow, ReportFilters } from "./types"

type ContactRow = { primary_email: string | null; primary_phone: string | null; first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string }

function tenantName(c: ContactRow | null): string {
  if (!c) return "Unknown"
  if (c.entity_type === "company") return c.company_name ?? "Unknown"
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unknown"
}

export async function buildArrearsAgingReport(filters: ReportFilters): Promise<ArrearsAgingData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  let caseQuery = db
    .from("arrears_cases")
    .select("tenant_id, unit_id, property_id, current_step, status, units(unit_number), properties(name)")
    .eq("org_id", orgId)
    .in("status", ["open", "arrangement"])
  if (propertyIds?.length) caseQuery = caseQuery.in("property_id", propertyIds)

  const { data: cases, error: cErr } = await caseQuery
  if (cErr) console.error("arrearsAging cases:", cErr.message)

  const allCases = cases ?? []
  if (allCases.length === 0) {
    return { as_at: new Date(), cases: [], total_30d_cents: 0, total_60d_cents: 0, total_90d_cents: 0, total_90plus_cents: 0, total_arrears_cents: 0, tenants_in_arrears: 0 }
  }

  const tenantIds = [...new Set(allCases.map((c) => c.tenant_id as string))]

  const [{ data: invoices, error: invErr }, { data: tenants, error: tErr }, { data: payments, error: pErr }] = await Promise.all([
    db
      .from("rent_invoices")
      .select("tenant_id, total_amount_cents, amount_paid_cents, due_date")
      .eq("org_id", orgId)
      .in("tenant_id", tenantIds)
      .not("status", "in", "(paid,cancelled,credit)"),
    db
      .from("tenants")
      .select("id, contacts(primary_email, primary_phone, first_name, last_name, company_name, entity_type)")
      .in("id", tenantIds),
    db
      .from("payments")
      .select("tenant_id, payment_date")
      .eq("org_id", orgId)
      .in("tenant_id", tenantIds)
      .order("payment_date", { ascending: false }),
  ])

  if (invErr) console.error("arrearsAging invoices:", invErr.message)
  if (tErr) console.error("arrearsAging tenants:", tErr.message)
  if (pErr) console.error("arrearsAging payments:", pErr.message)

  const now = Date.now()

  // Invoice-level aging: each invoice's balance assigned to the correct bucket
  const tenantBuckets = new Map<string, { b30: number; b60: number; b90: number; b90p: number }>()
  for (const inv of invoices ?? []) {
    const tid = inv.tenant_id as string
    const days = Math.floor((now - new Date(inv.due_date as string).getTime()) / 86_400_000)
    const amt = Math.max(0, ((inv.total_amount_cents as number) ?? 0) - ((inv.amount_paid_cents as number) ?? 0))
    const existing = tenantBuckets.get(tid) ?? { b30: 0, b60: 0, b90: 0, b90p: 0 }
    if (days <= 30) existing.b30 += amt
    else if (days <= 60) existing.b60 += amt
    else if (days <= 90) existing.b90 += amt
    else existing.b90p += amt
    tenantBuckets.set(tid, existing)
  }

  type TenantRow = { id: string; contacts: ContactRow | null }
  const tenantInfoMap = new Map((tenants ?? []).map((t) => [t.id as string, (t as unknown as TenantRow).contacts]))

  // Last payment per tenant (payments ordered desc, so first hit per tenant is latest)
  const lastPaymentMap = new Map<string, string>()
  for (const p of payments ?? []) {
    const tid = p.tenant_id as string
    if (!lastPaymentMap.has(tid)) lastPaymentMap.set(tid, p.payment_date as string)
  }

  let total30 = 0, total60 = 0, total90 = 0, total90plus = 0

  const rows: ArrearsAgingRow[] = allCases.map((c) => {
    const tid = c.tenant_id as string
    const buckets = tenantBuckets.get(tid) ?? { b30: 0, b60: 0, b90: 0, b90p: 0 }
    total30 += buckets.b30; total60 += buckets.b60; total90 += buckets.b90; total90plus += buckets.b90p
    const contact = tenantInfoMap.get(tid) ?? null
    return {
      tenant_id: tid,
      tenant_name: tenantName(contact),
      unit_number: (c.units as unknown as { unit_number: string } | null)?.unit_number ?? "",
      property_name: (c.properties as unknown as { name: string } | null)?.name ?? "",
      arrears_30d_cents: buckets.b30,
      arrears_60d_cents: buckets.b60,
      arrears_90d_cents: buckets.b90,
      arrears_90plus_cents: buckets.b90p,
      total_cents: buckets.b30 + buckets.b60 + buckets.b90 + buckets.b90p,
      current_step: (c.current_step as number) ?? 0,
      status: c.status as string,
      email: contact?.primary_email ?? null,
      phone: contact?.primary_phone ?? null,
      last_payment_date: lastPaymentMap.get(tid) ?? null,
    }
  })

  return {
    as_at: new Date(),
    cases: rows.toSorted((a, b) => b.total_cents - a.total_cents),
    total_30d_cents: total30,
    total_60d_cents: total60,
    total_90d_cents: total90,
    total_90plus_cents: total90plus,
    total_arrears_cents: total30 + total60 + total90 + total90plus,
    tenants_in_arrears: rows.length,
  }
}
