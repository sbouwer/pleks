import { createServiceClient } from "@/lib/supabase/server"
import type { ExpenseReportData, ExpenseRow, ReportFilters } from "./types"

export async function buildExpenseReport(filters: ReportFilters): Promise<ExpenseReportData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  // Maintenance jobs
  let maintQuery = db
    .from("maintenance_requests")
    .select("work_order_number, property_id, category, contractor_id, actual_cost_cents, completed_at, properties(name), contractors(name)")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("completed_at", fromStr)
    .lte("completed_at", toStr)
    .gt("actual_cost_cents", 0)
  if (propertyIds?.length) maintQuery = maintQuery.in("property_id", propertyIds)
  const { data: maintData, error: maintErr } = await maintQuery
  if (maintErr) console.error("expenseReport maintenance:", maintErr.message)

  // Supplier invoices
  let siQuery = db
    .from("supplier_invoices")
    .select("description, property_id, category, supplier_name, amount_cents, invoice_date, properties(name)")
    .eq("org_id", orgId)
    .gte("invoice_date", fromStr)
    .lte("invoice_date", toStr)
  if (propertyIds?.length) siQuery = siQuery.in("property_id", propertyIds)
  const { data: siData, error: siErr } = await siQuery
  if (siErr) console.error("expenseReport supplier_invoices:", siErr.message)

  const rows: ExpenseRow[] = []

  for (const m of maintData ?? []) {
    const propRaw = m.properties as unknown as { name: string } | null
    const contractorRaw = m.contractors as unknown as { name: string } | null
    rows.push({
      date: m.completed_at?.slice(0, 10) ?? "",
      description: `Maintenance — ${m.work_order_number ?? m.category}`,
      property_name: propRaw?.name ?? "Unknown",
      category: m.category ?? "General",
      sars_code: "4255",
      supplier: contractorRaw?.name ?? "—",
      amount_cents: m.actual_cost_cents ?? 0,
    })
  }

  for (const s of siData ?? []) {
    const propRaw = s.properties as unknown as { name: string } | null
    rows.push({
      date: s.invoice_date?.slice(0, 10) ?? "",
      description: s.description ?? s.category ?? "Expense",
      property_name: propRaw?.name ?? "Unknown",
      category: s.category ?? "General",
      sars_code: "4255",
      supplier: s.supplier_name ?? "—",
      amount_cents: s.amount_cents ?? 0,
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date))

  const categoryMap = new Map<string, { amount_cents: number; count: number }>()
  for (const r of rows) {
    const existing = categoryMap.get(r.category) ?? { amount_cents: 0, count: 0 }
    categoryMap.set(r.category, { amount_cents: existing.amount_cents + r.amount_cents, count: existing.count + 1 })
  }

  return {
    period: { from, to },
    rows,
    by_category: Array.from(categoryMap.entries()).map(([category, v]) => ({ category, ...v })),
    total_amount_cents: rows.reduce((s, r) => s + r.amount_cents, 0),
  }
}
