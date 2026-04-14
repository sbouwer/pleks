import { toDateStr } from "./periods"
import { createServiceClient } from "@/lib/supabase/server"
import { SARS_EXPENSE_CATEGORIES, type SARSCategory } from "@/lib/finance/sarsCategories"
import type { ExpenseReportData, ExpenseRow, ReportFilters } from "./types"

function mapToSARSLabel(category: string | null | undefined): string {
  const cat = (category ?? "").toLowerCase()
  let key: SARSCategory = "other_allowable"
  if (cat.includes("repair") || cat.includes("maintenance") || cat.includes("plumb") || cat.includes("electr") || cat.includes("paint") || cat.includes("carpent") || cat.includes("roof") || cat.includes("general")) key = "repairs_maintenance"
  else if (cat.includes("manage") || cat.includes("agent") || cat.includes("commission")) key = "management_fees"
  else if (cat.includes("secur") || cat.includes("alarm") || cat.includes("cctv") || cat.includes("guard")) key = "security"
  else if (cat.includes("garden") || cat.includes("landscap") || cat.includes("lawn")) key = "garden_services"
  else if (cat.includes("levy") || cat.includes("levies") || cat.includes("hoa") || cat.includes("body corp")) key = "levies"
  else if (cat.includes("advert") || cat.includes("market") || cat.includes("listing")) key = "advertising"
  else if (cat.includes("insur")) key = "insurance"
  else if (cat.includes("rates") || cat.includes("municipal")) key = "rates_taxes"
  else if (cat.includes("improv") || cat.includes("renovat") || cat.includes("extend") || cat.includes("capital")) key = "improvements"
  return SARS_EXPENSE_CATEGORIES[key].label
}

export async function buildExpenseReport(filters: ReportFilters): Promise<ExpenseReportData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

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

  let siQuery = db
    .from("supplier_invoices")
    .select("description, property_id, amount_incl_vat_cents, invoice_date, properties(name), contractors(name)")
    .eq("org_id", orgId)
    .gte("invoice_date", fromStr)
    .lte("invoice_date", toStr)
    .in("status", ["approved", "pending_payment", "paid"])
  if (propertyIds?.length) siQuery = siQuery.in("property_id", propertyIds)
  const { data: siData, error: siErr } = await siQuery
  if (siErr) console.error("expenseReport supplier_invoices:", siErr.message)

  const rows: ExpenseRow[] = []

  for (const m of maintData ?? []) {
    const propRaw = m.properties as unknown as { name: string } | null
    const contractorRaw = m.contractors as unknown as { name: string } | null
    rows.push({
      date: (m.completed_at as string | null)?.slice(0, 10) ?? "",
      description: `${m.category ?? "Maintenance"} — ${m.work_order_number ?? ""}`.trim().replace(/— $/, ""),
      property_name: propRaw?.name ?? "Unknown",
      category: m.category ?? "General",
      sars_code: mapToSARSLabel(m.category as string | null),
      supplier: contractorRaw?.name ?? "—",
      amount_cents: (m.actual_cost_cents as number) ?? 0,
    })
  }

  for (const s of siData ?? []) {
    const propRaw = s.properties as unknown as { name: string } | null
    const contractorRaw = s.contractors as unknown as { name: string } | null
    rows.push({
      date: (s.invoice_date as string | null)?.slice(0, 10) ?? "",
      description: (s.description as string | null) ?? "Expense",
      property_name: propRaw?.name ?? "Unknown",
      category: "supplier",
      sars_code: mapToSARSLabel(s.description as string | null),
      supplier: contractorRaw?.name ?? "—",
      amount_cents: (s.amount_incl_vat_cents as number) ?? 0,
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date))

  const categoryMap = new Map<string, { amount_cents: number; count: number }>()
  for (const r of rows) {
    const existing = categoryMap.get(r.sars_code) ?? { amount_cents: 0, count: 0 }
    categoryMap.set(r.sars_code, { amount_cents: existing.amount_cents + r.amount_cents, count: existing.count + 1 })
  }

  return {
    period: { from, to },
    rows,
    by_category: Array.from(categoryMap.entries()).map(([category, v]) => ({ category, ...v })),
    total_amount_cents: rows.reduce((s, r) => s + r.amount_cents, 0),
  }
}
