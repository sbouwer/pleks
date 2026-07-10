"use server"

/**
 * lib/statements/generateOwnerStatement.ts — Generate and persist monthly owner statement data
 *
 * Auth:   Server-only; called from cron (owner-statement-gen) and manual triggers
 * Data:   properties + organisations, rent_invoices, supplier_invoices via service client
 * Notes:  Returns signatureAttribution + tenantWelcomeSender from OrgCapabilities so the
 *         PDF renderer can use org-type-correct framing without re-fetching the org.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { calculateManagementFee } from "@/lib/finance/managementFee"
import { getOrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** `periodFrom`/`periodTo` are calendar dates ("YYYY-MM-DD"), not instants — they bound a statement MONTH.
 *  They used to be `Date`s sliced in UTC here, while the cron built them with local-time startOfMonth. */
export async function generateOwnerStatement(
  propertyId: string,
  periodFrom: string,
  periodTo: string
) {
  const supabase = await createServiceClient()

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("*, organisations(*)")
    .eq("id", propertyId)
    .single()
    logQueryError("generateOwnerStatement properties", propertyError)

  if (!property) return null

  const org = property.organisations as Record<string, unknown>
  const capabilities = getOrgCapabilities(
    ((org.type as OrgType) ?? "agency"),
    ((org.name as string) ?? ""),
  )

  // Income: rent invoices for units at this property
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId)
    .is("deleted_at", null)
    logQueryError("generateOwnerStatement units", unitsError)

  const unitIds = (units || []).map((u) => u.id)

  const { data: invoices } = unitIds.length > 0
    ? await supabase
        .from("rent_invoices")
        .select("*, leases(tenant_id, tenant_view(first_name, last_name, company_name, entity_type)), units(unit_number)")
        .in("unit_id", unitIds)
        .gte("period_from", periodFrom)
        .lte("period_to", periodTo)
    : { data: [] }

  const incomeLines = (invoices || []).map((inv) => {
    const tenant = (inv.leases as Record<string, unknown>)?.tenant_view as Record<string, string> | undefined
    const unit = inv.units as Record<string, string> | null
    const tenantName = tenant?.entity_type === "organisation"
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
  const { data: expenses, error: expensesError } = await supabase
    .from("supplier_invoices")
    .select("*, contractor_view(first_name, last_name, company_name)")
    .eq("property_id", propertyId)
    .in("status", ["paid", "owner_direct_recorded"])
    .eq("statement_month", periodFrom)
    logQueryError("generateOwnerStatement supplier_invoices", expensesError)

  const expenseLines = (expenses || []).map((exp) => ({
    description: exp.statement_line_description || exp.description,
    contractor: ((cv) => cv?.company_name || `${cv?.first_name ?? ""} ${cv?.last_name ?? ""}`.trim() || "—")(exp.contractor_view as Record<string, string> | null),
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
  const { data: statement, error: statementError } = await supabase
    .from("owner_statements")
    .insert({
      org_id: property.org_id,
      property_id: propertyId,
      period_month: periodFrom,
      period_from: periodFrom,
      period_to: periodTo,
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
    .select("id, portal_token")
    .single()
    logQueryError("generateOwnerStatement owner_statements", statementError)

  if (!statement) return null

  return {
    ...statement,
    // Org-type-aware copy for PDF rendering — avoids re-fetching org in the render layer
    signatureAttribution: capabilities.copy.signatureAttribution,
    tenantWelcomeSender: capabilities.copy.tenantWelcomeSender,
  }
}
