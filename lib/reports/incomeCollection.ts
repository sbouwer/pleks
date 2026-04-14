import { toDateStr } from "./periods"
import { createServiceClient } from "@/lib/supabase/server"
import type { IncomeCollectionData, IncomeCollectionRow, ReportFilters } from "./types"

export async function buildIncomeCollectionReport(filters: ReportFilters): Promise<IncomeCollectionData> {
  const supabase = await createServiceClient()
  const { orgId, from, to } = filters

  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

  const [invoicesRes, paymentsRes] = await Promise.all([
    supabase
      .from("rent_invoices")
      .select(`
        id, unit_id, tenant_id, invoice_number, period_from, period_to,
        total_amount_cents, amount_paid_cents, status,
        units(unit_number, property_id, properties(name)),
        tenant_view(first_name, last_name)
      `)
      .eq("org_id", orgId)
      .gte("period_from", fromStr)
      .lte("period_to", toStr)
      .order("period_from"),
    supabase
      .from("payments")
      .select("id, invoice_id, amount_cents, payment_date, payment_method")
      .eq("org_id", orgId)
      .gte("payment_date", fromStr)
      .lte("payment_date", toStr),
  ])

  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []

  // Map payments by invoice
  const paymentsByInvoice = new Map<string, { date: string; method: string }>()
  for (const p of payments) {
    if (p.invoice_id) {
      paymentsByInvoice.set(p.invoice_id, {
        date: p.payment_date,
        method: p.payment_method ?? "unknown",
      })
    }
  }

  // Filter by property if needed
  const filteredInvoices = filters.propertyIds?.length
    ? invoices.filter((inv) => {
        const unit = inv.units as unknown as { unit_number: string; property_id: string; properties: { name: string; id: string } | null } | null
        const propId = unit?.properties?.id ?? unit?.property_id
        return propId && filters.propertyIds!.includes(propId)
      })
    : invoices

  const rows: IncomeCollectionRow[] = filteredInvoices.map((inv) => {
    const unit = inv.units as unknown as { unit_number: string; property_id: string; properties: { name: string } | null } | null
    const prop = unit?.properties ?? null
    const tenant = inv.tenant_view as unknown as { first_name: string; last_name: string } | null
    const payment = paymentsByInvoice.get(inv.id)

    return {
      unit_id: inv.unit_id,
      unit_number: unit?.unit_number ?? "",
      property_name: prop?.name ?? "",
      tenant_name: tenant ? `${tenant.first_name} ${tenant.last_name}` : null,
      invoice_number: inv.invoice_number,
      period_from: new Date(inv.period_from),
      period_to: new Date(inv.period_to),
      total_amount_cents: inv.total_amount_cents,
      amount_paid_cents: inv.amount_paid_cents ?? 0,
      status: inv.status,
      payment_date: payment?.date ? new Date(payment.date) : null,
      payment_method: payment?.method ?? null,
    }
  })

  const expectedIncome = rows.reduce((s, r) => s + r.total_amount_cents, 0)
  const collectedIncome = rows.reduce((s, r) => s + r.amount_paid_cents, 0)

  // DebiCheck vs EFT breakdown
  const debicheckPayments = payments.filter((p) => p.payment_method === "debicheck")
  const eftPayments = payments.filter((p) => p.payment_method === "eft" || p.payment_method === "manual")

  return {
    period: { from, to },
    invoices: rows,
    expected_income_cents: expectedIncome,
    collected_income_cents: collectedIncome,
    outstanding_cents: Math.max(0, expectedIncome - collectedIncome),
    collection_rate: expectedIncome > 0 ? Math.round((collectedIncome / expectedIncome) * 100) : 0,
    debicheck_collected_cents: debicheckPayments.reduce((s, p) => s + (p.amount_cents ?? 0), 0),
    debicheck_count: debicheckPayments.length,
    eft_collected_cents: eftPayments.reduce((s, p) => s + (p.amount_cents ?? 0), 0),
    eft_count: eftPayments.length,
  }
}
