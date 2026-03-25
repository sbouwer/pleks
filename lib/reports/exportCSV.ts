import { formatDateShort } from "./periods"
import type {
  IncomeCollectionData,
  ArrearsAgingData,
  MaintenanceCostData,
  RentRollData,
  OccupancyData,
  OwnerPortfolioData,
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

// Xero-ready exports (Firm tier)
export function exportXeroIncome(data: IncomeCollectionData): string {
  return toCSV(
    ["*ContactName", "*InvoiceNumber", "*InvoiceDate", "*DueDate", "Description", "*Quantity", "*UnitAmount", "*AccountCode", "TaxType"],
    data.invoices.filter((inv) => inv.tenant_name).map((inv) => [
      inv.tenant_name!,
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
