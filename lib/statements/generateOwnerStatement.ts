"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { calculateManagementFee } from "@/lib/finance/managementFee"

export async function generateOwnerStatement(
  propertyId: string,
  periodFrom: Date,
  periodTo: Date
) {
  const supabase = await createServiceClient()

  const { data: property } = await supabase
    .from("properties")
    .select("*, organisations(*)")
    .eq("id", propertyId)
    .single()

  if (!property) return null

  const org = property.organisations as Record<string, unknown>
  const periodFromStr = periodFrom.toISOString().split("T")[0]
  const periodToStr = periodTo.toISOString().split("T")[0]

  // Income: rent invoices for units at this property
  const { data: units } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId)
    .eq("is_archived", false)

  const unitIds = (units || []).map((u) => u.id)

  const { data: invoices } = unitIds.length > 0
    ? await supabase
        .from("rent_invoices")
        .select("*, leases(tenant_id, tenants(first_name, last_name, company_name, tenant_type)), units(unit_number)")
        .in("unit_id", unitIds)
        .gte("period_from", periodFromStr)
        .lte("period_to", periodToStr)
    : { data: [] }

  const incomeLines = (invoices || []).map((inv) => {
    const tenant = (inv.leases as Record<string, unknown>)?.tenants as Record<string, string> | undefined
    const unit = inv.units as Record<string, string> | null
    const tenantName = tenant?.tenant_type === "company"
      ? tenant.company_name
      : `${tenant?.first_name || ""} ${tenant?.last_name || ""}`.trim()
    return {
      unit: unit?.unit_number || "—",
      tenant: tenantName || "—",
      invoice_ref: inv.invoice_number,
      amount_cents: inv.rent_amount_cents,
      amount_paid_cents: inv.amount_paid_cents || 0,
      status: inv.status,
      arrears_note: ["open", "partial", "overdue"].includes(inv.status)
        ? `R${((inv.balance_cents || 0) / 100).toFixed(0)} outstanding`
        : null,
    }
  })

  const grossIncomeCents = incomeLines.reduce((sum, l) => sum + l.amount_paid_cents, 0)

  // Expenses: paid supplier invoices for this property in this period
  const { data: expenses } = await supabase
    .from("supplier_invoices")
    .select("*, contractors(name)")
    .eq("property_id", propertyId)
    .in("status", ["paid", "owner_direct_recorded"])
    .eq("statement_month", periodFromStr)

  const expenseLines = (expenses || []).map((exp) => ({
    description: exp.statement_line_description || exp.description,
    contractor: (exp.contractors as Record<string, string> | null)?.name || "—",
    invoice_ref: exp.invoice_number || "—",
    amount_cents: exp.amount_incl_vat_cents,
  }))

  const totalExpensesCents = expenseLines.reduce((sum, e) => sum + e.amount_cents, 0)

  // Management fee
  const fee = calculateManagementFee(
    grossIncomeCents,
    (org.management_fee_percent as number) || 10,
    (org.management_fee_type as string) || "percent",
    (org.management_fee_fixed_cents as number) || null,
    (org.management_fee_vat_applicable as boolean) || false
  )

  const netToOwnerCents = grossIncomeCents - totalExpensesCents - fee.feeInclVat

  // Arrears
  const arrearsLines = incomeLines
    .filter((l) => l.arrears_note)
    .map((l) => ({
      unit: l.unit,
      tenant: l.tenant,
      invoice_ref: l.invoice_ref,
      overdue_amount_cents: l.amount_cents - l.amount_paid_cents,
    }))

  // Create statement
  const { data: statement } = await supabase
    .from("owner_statements")
    .insert({
      org_id: property.org_id,
      property_id: propertyId,
      period_month: periodFromStr,
      period_from: periodFromStr,
      period_to: periodToStr,
      gross_income_cents: grossIncomeCents,
      total_expenses_cents: totalExpensesCents,
      management_fee_cents: fee.feeExclVat,
      management_fee_vat_cents: fee.vatAmount,
      net_to_owner_cents: netToOwnerCents,
      income_lines: incomeLines,
      expense_lines: expenseLines,
      arrears_lines: arrearsLines,
      status: "generated",
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  return statement
}
