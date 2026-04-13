import { formatDateShort } from "./periods"
import type {
  IncomeCollectionData,
  ArrearsAgingData,
  MaintenanceCostData,
  RentRollData,
  OccupancyData,
  OwnerPortfolioData,
  DepositRegisterData,
  ManagementFeeSummaryData,
  ExpenseReportData,
  VatSummaryData,
  TrustReconciliationData,
  TenantPaymentHistoryData,
  DebitOrderReportData,
  TenantDirectoryData,
  PropertyPerformanceData,
  VacancyAnalysisData,
  MunicipalCostsData,
  CpaNoticeScheduleData,
  InspectionScheduleData,
  PopiaConsentAuditData,
  ContractorPerformanceData,
  MaintenanceSlaData,
} from "./types"

function formatCentsForCSV(cents: number): string {
  return (cents / 100).toFixed(2)
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function toCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSV).join(",")
  const dataLines = rows.map((r) => r.map(escapeCSV).join(","))
  return [headerLine, ...dataLines].join("\n")
}

export function exportIncomeCollectionCSV(data: IncomeCollectionData): string {
  return toCSV(
    ["Unit", "Property", "Tenant", "Invoice", "Period From", "Period To", "Expected", "Received", "Status"],
    data.invoices.map((inv) => [
      inv.unit_number,
      inv.property_name,
      inv.tenant_name ?? "VACANT",
      inv.invoice_number,
      formatDateShort(inv.period_from),
      formatDateShort(inv.period_to),
      formatCentsForCSV(inv.total_amount_cents),
      formatCentsForCSV(inv.amount_paid_cents),
      inv.status,
    ])
  )
}

export function exportArrearsAgingCSV(data: ArrearsAgingData): string {
  return toCSV(
    ["Tenant", "Unit", "Property", "0-30d", "31-60d", "61-90d", "90d+", "Total", "Arrears Step"],
    data.cases.map((c) => [
      c.tenant_name,
      c.unit_number,
      c.property_name,
      formatCentsForCSV(c.arrears_30d_cents),
      formatCentsForCSV(c.arrears_60d_cents),
      formatCentsForCSV(c.arrears_90d_cents),
      formatCentsForCSV(c.arrears_90plus_cents),
      formatCentsForCSV(c.total_cents),
      `Step ${c.current_step}`,
    ])
  )
}

export function exportMaintenanceCostsCSV(data: MaintenanceCostData): string {
  return toCSV(
    ["Work Order", "Property", "Unit", "Category", "Contractor", "Date", "Cost"],
    data.jobs.map((job) => [
      job.work_order_number,
      job.property_name,
      job.unit_number,
      job.category,
      job.contractor_name,
      job.completed_at ? formatDateShort(job.completed_at) : "",
      formatCentsForCSV(job.actual_cost_cents),
    ])
  )
}

export function exportRentRollCSV(data: RentRollData): string {
  return toCSV(
    ["Property", "Unit", "Tenant", "Rent/mo", "Lease Start", "Lease End", "Type", "Method", "Status", "Arrears"],
    data.rows.map((r) => [
      r.property_name,
      r.unit_number,
      r.tenant_name ?? "VACANT",
      formatCentsForCSV(r.monthly_rent_cents),
      r.lease_start ? formatDateShort(r.lease_start) : "",
      r.lease_end ? formatDateShort(r.lease_end) : "M2M",
      r.lease_type,
      r.payment_method,
      r.status,
      formatCentsForCSV(r.arrears_cents),
    ])
  )
}

export function exportOccupancyCSV(data: OccupancyData): string {
  const rows = [...data.rows, data.totals]
  return toCSV(
    ["Property", "Total Units", "Occupied", "Vacant", "Notice", "Occupancy Rate"],
    rows.map((r) => [
      r.property_name,
      String(r.total_units),
      String(r.occupied_units),
      String(r.vacant_units),
      String(r.notice_units),
      `${r.occupancy_rate}%`,
    ])
  )
}

export function exportOwnerPortfolioCSV(data: OwnerPortfolioData): string {
  return toCSV(
    ["Owner", "Property", "Units", "Gross Income", "Expenses", "Net to Owner", "Deposits Held"],
    data.owners.map((o) => [
      o.owner_name,
      o.property_name,
      String(o.units),
      formatCentsForCSV(o.gross_income_cents),
      formatCentsForCSV(o.expenses_cents),
      formatCentsForCSV(o.net_to_owner_cents),
      formatCentsForCSV(o.deposits_held_cents),
    ])
  )
}

// ── New BUILD_52 CSV exports ─────────────────────────────────────────────────

export function exportDepositRegisterCSV(data: DepositRegisterData): string {
  return toCSV(
    ["Tenant", "Unit", "Property", "Amount Held", "Date Received", "Status"],
    data.rows.map((r) => [
      r.tenant_name,
      r.unit_number,
      r.property_name,
      formatCentsForCSV(r.amount_cents),
      r.date_received,
      r.status,
    ])
  )
}

export function exportManagementFeeSummaryCSV(data: ManagementFeeSummaryData): string {
  return toCSV(
    ["Property", "Period", "Fee", "VAT", "Total", "Status"],
    data.rows.map((r) => [
      r.property_name,
      r.period,
      formatCentsForCSV(r.fee_cents),
      formatCentsForCSV(r.vat_cents),
      formatCentsForCSV(r.total_cents),
      r.status,
    ])
  )
}

export function exportExpenseReportCSV(data: ExpenseReportData): string {
  return toCSV(
    ["Date", "Description", "Property", "Category", "SARS Code", "Supplier", "Amount"],
    data.rows.map((r) => [
      r.date,
      r.description,
      r.property_name,
      r.category,
      r.sars_code,
      r.supplier,
      formatCentsForCSV(r.amount_cents),
    ])
  )
}

export function exportVatSummaryCSV(data: VatSummaryData): string {
  const outputRows = data.output_lines.map((l) => ["Output", l.description, formatCentsForCSV(l.net_cents), formatCentsForCSV(l.vat_cents)])
  const inputRows = data.input_lines.map((l) => ["Input", l.description, formatCentsForCSV(l.net_cents), formatCentsForCSV(l.vat_cents)])
  return toCSV(
    ["Type", "Description", "Net Amount", "VAT Amount"],
    [...outputRows, ...inputRows]
  )
}

export function exportTrustReconciliationCSV(data: TrustReconciliationData): string {
  return toCSV(
    ["Date", "Description", "Type", "Credit", "Debit", "Reference"],
    data.rows.map((r) => [
      r.date,
      r.description,
      r.type,
      formatCentsForCSV(r.credit_cents),
      formatCentsForCSV(r.debit_cents),
      r.reference ?? "",
    ])
  )
}

export function exportTenantPaymentHistoryCSV(data: TenantPaymentHistoryData): string {
  return toCSV(
    ["Tenant", "Unit", "Property", "Invoiced", "Paid", "Balance", "Last Payment", "Payment Count"],
    data.rows.map((r) => [
      r.tenant_name,
      r.unit_number,
      r.property_name,
      formatCentsForCSV(r.total_invoiced_cents),
      formatCentsForCSV(r.total_paid_cents),
      formatCentsForCSV(r.balance_cents),
      r.last_payment_date ?? "",
      String(r.payment_count),
    ])
  )
}

export function exportDebitOrderReportCSV(data: DebitOrderReportData): string {
  return toCSV(
    ["Tenant", "Unit", "Property", "Amount", "Status", "Last Collection", "Next Collection"],
    data.rows.map((r) => [
      r.tenant_name,
      r.unit_number,
      r.property_name,
      formatCentsForCSV(r.amount_cents),
      r.status,
      r.last_collection_date ?? "",
      r.next_collection_date ?? "",
    ])
  )
}

export function exportTenantDirectoryCSV(data: TenantDirectoryData): string {
  return toCSV(
    ["Tenant", "Email", "Phone", "Unit", "Property", "Lease End", "Monthly Rent"],
    data.rows.map((r) => [
      r.tenant_name,
      r.email ?? "",
      r.phone ?? "",
      r.unit_number,
      r.property_name,
      r.lease_end ?? "",
      formatCentsForCSV(r.monthly_rent_cents),
    ])
  )
}

export function exportPropertyPerformanceCSV(data: PropertyPerformanceData): string {
  return toCSV(
    ["Property", "Units", "Occupied", "Occupancy %", "Gross Income", "Expenses", "Net Income", "Maintenance"],
    data.rows.map((r) => [
      r.property_name,
      String(r.units),
      String(r.occupied_units),
      `${r.occupancy_rate}%`,
      formatCentsForCSV(r.gross_income_cents),
      formatCentsForCSV(r.total_expenses_cents),
      formatCentsForCSV(r.net_income_cents),
      formatCentsForCSV(r.maintenance_spend_cents),
    ])
  )
}

export function exportVacancyAnalysisCSV(data: VacancyAnalysisData): string {
  return toCSV(
    ["Unit", "Property", "Days Vacant", "Monthly Rent", "Est. Lost Income"],
    data.currently_vacant.map((r) => [
      r.unit_number,
      r.property_name,
      String(r.days_vacant),
      formatCentsForCSV(r.monthly_rent_cents),
      formatCentsForCSV(r.estimated_lost_cents),
    ])
  )
}

export function exportMunicipalCostsCSV(data: MunicipalCostsData): string {
  return toCSV(
    ["Property", "Period", "Water", "Electricity", "Rates", "Refuse", "Total"],
    data.rows.map((r) => [
      r.property_name,
      r.period,
      formatCentsForCSV(r.water_cents),
      formatCentsForCSV(r.electricity_cents),
      formatCentsForCSV(r.rates_cents),
      formatCentsForCSV(r.refuse_cents),
      formatCentsForCSV(r.total_cents),
    ])
  )
}

export function exportCpaNoticeScheduleCSV(data: CpaNoticeScheduleData): string {
  return toCSV(
    ["Tenant", "Unit", "Property", "Lease End", "Days Remaining", "Notice Due By", "Status"],
    data.rows.map((r) => [
      r.tenant_name,
      r.unit_number,
      r.property_name,
      r.lease_end,
      String(r.days_remaining),
      r.notice_due_by,
      r.status,
    ])
  )
}

export function exportInspectionScheduleCSV(data: InspectionScheduleData): string {
  return toCSV(
    ["Unit", "Property", "Type", "Scheduled Date", "Status", "Days Overdue"],
    data.rows.map((r) => [
      r.unit_number,
      r.property_name,
      r.type,
      r.scheduled_date,
      r.status,
      String(r.days_overdue),
    ])
  )
}

export function exportPopiaConsentAuditCSV(data: PopiaConsentAuditData): string {
  return toCSV(
    ["Tenant", "Consent Type", "Granted At", "Version"],
    data.rows.map((r) => [
      r.tenant_name,
      r.consent_type,
      r.granted_at,
      r.version ?? "",
    ])
  )
}

export function exportContractorPerformanceCSV(data: ContractorPerformanceData): string {
  return toCSV(
    ["Contractor", "Trade", "Jobs Assigned", "Jobs Completed", "Total Spend"],
    data.rows.map((r) => [
      r.contractor_name,
      r.trade ?? "",
      String(r.jobs_assigned),
      String(r.jobs_completed),
      formatCentsForCSV(r.total_spend_cents),
    ])
  )
}

export function exportMaintenanceSlaCSV(data: MaintenanceSlaData): string {
  return toCSV(
    ["Work Order", "Property", "Category", "Urgency", "SLA Target (h)", "Actual (h)", "Met SLA", "Created At"],
    data.all_rows.map((r) => [
      r.work_order_number,
      r.property_name,
      r.category,
      r.urgency,
      String(r.sla_target_hours),
      r.actual_hours !== null ? String(r.actual_hours) : "",
      r.met_sla ? "Yes" : "No",
      r.created_at,
    ])
  )
}

// Xero-ready exports (Firm tier)
export function exportXeroIncome(data: IncomeCollectionData): string {
  return toCSV(
    ["*ContactName", "*InvoiceNumber", "*InvoiceDate", "*DueDate", "Description", "*Quantity", "*UnitAmount", "*AccountCode", "TaxType"],
    data.invoices.filter((inv) => inv.tenant_name !== null && inv.tenant_name !== undefined).map((inv) => [
      inv.tenant_name ?? "",
      inv.invoice_number,
      formatDateShort(inv.period_from),
      formatDateShort(inv.period_to),
      `Rent — ${inv.unit_number}, ${inv.property_name}`,
      "1",
      formatCentsForCSV(inv.total_amount_cents),
      "200", // Xero rental income account
      "Tax Exempt",
    ])
  )
}

export function exportXeroExpenses(data: MaintenanceCostData): string {
  return toCSV(
    ["*ContactName", "*InvoiceNumber", "*InvoiceDate", "*DueDate", "Description", "*Quantity", "*UnitAmount", "*AccountCode", "TaxType"],
    data.jobs.map((job, i) => [
      job.contractor_name || "Unknown Contractor",
      `MAINT-${job.work_order_number || i + 1}`,
      job.completed_at ? formatDateShort(job.completed_at) : "",
      job.completed_at ? formatDateShort(job.completed_at) : "",
      `${job.category} — ${job.unit_number}, ${job.property_name}`,
      "1",
      formatCentsForCSV(job.actual_cost_cents),
      "461", // Xero repairs & maintenance account
      "Tax on Purchases (15%)",
    ])
  )
}
