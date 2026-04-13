import { createServiceClient } from "@/lib/supabase/server"
import type { VatSummaryData, ReportFilters } from "./types"

export async function buildVatSummary(filters: ReportFilters): Promise<VatSummaryData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  let stmtQuery = db
    .from("owner_statements")
    .select("period_from, period_month, management_fee_cents, management_fee_vat_cents, properties(name)")
    .eq("org_id", orgId)
    .gte("period_from", fromStr)
    .lte("period_to", toStr)
  if (propertyIds?.length) stmtQuery = stmtQuery.in("property_id", propertyIds)
  const { data: stmts, error: stmtErr } = await stmtQuery
  if (stmtErr) console.error("vatSummary statements:", stmtErr.message)

  let siQuery = db
    .from("supplier_invoices")
    .select("description, amount_excl_vat_cents, vat_amount_cents, invoice_date")
    .eq("org_id", orgId)
    .gte("invoice_date", fromStr)
    .lte("invoice_date", toStr)
  if (propertyIds?.length) siQuery = siQuery.in("property_id", propertyIds)
  const { data: invoices, error: siErr } = await siQuery
  if (siErr) console.error("vatSummary supplier_invoices:", siErr.message)

  const outputLines = (stmts ?? [])
    .filter((s) => (s.management_fee_vat_cents ?? 0) > 0)
    .map((s) => {
      const propRaw = s.properties as unknown as { name: string } | null
      const period = s.period_from?.slice(0, 7) ?? s.period_month?.slice(0, 7) ?? ""
      return {
        description: `Management fee — ${propRaw?.name ?? "Property"} ${period}`,
        net_cents: s.management_fee_cents ?? 0,
        vat_cents: s.management_fee_vat_cents ?? 0,
      }
    })

  const inputLines = (invoices ?? [])
    .filter((i) => (i.vat_amount_cents ?? 0) > 0)
    .map((i) => ({
      description: i.description ?? "Expense",
      net_cents: i.amount_excl_vat_cents ?? 0,
      vat_cents: i.vat_amount_cents ?? 0,
    }))

  const outputVat = outputLines.reduce((s, l) => s + l.vat_cents, 0)
  const inputVat = inputLines.reduce((s, l) => s + l.vat_cents, 0)

  return {
    period: { from, to },
    output_vat_cents: outputVat,
    input_vat_cents: inputVat,
    net_vat_cents: outputVat - inputVat,
    output_lines: outputLines,
    input_lines: inputLines,
  }
}
