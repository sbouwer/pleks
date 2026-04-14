import { formatZAR } from "@/lib/constants"
import { formatDateShort, formatPeriodLabel } from "./periods"
import { FONT_STACKS, getFontLink, type ReportBranding } from "./reportBranding"
import type {
  PortfolioSummaryData,
  IncomeCollectionData,
  ArrearsAgingData,
  RentRollData,
  OccupancyData,
  MaintenanceCostData,
  LeaseExpiryData,
  ApplicationPipelineData,
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

function getReportCSS(org: ReportBranding): string {
  const fontStack = FONT_STACKS[org.font] ?? FONT_STACKS.inter
  const accent = org.accent_color
  const accentLight = `${accent}1a`
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${fontStack}; font-size: 11px; color: #1a1a1a; padding: 20mm 15mm; }
  header { margin-bottom: 12px; }
  header img { max-height: 50px; }
  header .org-name { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  header .org-contact { font-size: 10px; color: #666; }
  hr.accent { border: none; border-top: 2px solid ${accent}; margin: 8px 0 16px; }
  h1 { font-size: 14px; margin-bottom: 4px; }
  h2 { font-size: 12px; margin: 16px 0 8px; color: ${accent}; }
  .period { font-size: 10px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; background: ${accentLight}; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
  tr:last-child td { border-bottom: 2px solid #e2e8f0; }
  tr.co-tenant td { background: #f8fafc; color: #64748b; font-size: 9px; }
  tr.co-tenant td:first-child { padding-left: 20px; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .metric { background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid ${accent}; border-radius: 6px; padding: 10px; }
  .metric .label { font-size: 9px; color: #64748b; text-transform: uppercase; }
  .metric .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .metric .sub { font-size: 9px; color: #94a3b8; }
  .text-right { text-align: right; }
  .text-danger { color: #dc2626; }
  .text-success { color: #16a34a; }
  .text-warning { color: #d97706; }
  .footer { margin-top: 24px; font-size: 8px; color: #94a3b8; text-align: center; }
  `
}

function classicLetterhead(org: ReportBranding): string {
  const contact = [org.address, org.phone, org.email].filter(Boolean).join(" | ")
  const logoHtml = org.logo_url ? `<img src="${org.logo_url}" alt="${org.org_name}" style="max-height:50px;display:block;margin:0 auto 8px;">` : ""
  return `
    <header style="text-align:center;">
      ${logoHtml}
      <div class="org-name">${org.org_name}</div>
      ${contact ? `<div class="org-contact">${contact}</div>` : ""}
    </header>
    <hr class="accent">
  `
}

function modernLetterhead(org: ReportBranding): string {
  const contact = [org.address, org.phone, org.email].filter(Boolean).join(" | ")
  const logoHtml = org.logo_url ? `<img src="${org.logo_url}" alt="${org.org_name}" style="max-height:40px;margin-right:12px;">` : ""
  const accentBar = `<div style="height:3px;background:${org.accent_color};margin:6px 0 12px;"></div>`
  return `
    <header style="display:flex;align-items:center;">
      ${logoHtml}
      <div>
        <div class="org-name">${org.org_name}</div>
        ${contact ? `<div class="org-contact">${contact}</div>` : ""}
      </div>
    </header>
    ${accentBar}
  `
}

function boldLetterhead(org: ReportBranding): string {
  const contact = [org.address, org.phone, org.email].filter(Boolean).join(" | ")
  const logoHtml = org.logo_url ? `<img src="${org.logo_url}" alt="${org.org_name}" style="max-height:60px;display:block;margin:8px auto;">` : ""
  const topBar = `<div style="height:6px;background:${org.accent_color};margin:-20mm -15mm 16px;"></div>`
  return `
    ${topBar}
    <header style="text-align:center;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:16px;">
      ${logoHtml}
      <div class="org-name" style="color:${org.accent_color};">${org.org_name}</div>
      ${contact ? `<div class="org-contact">${contact}</div>` : ""}
    </header>
  `
}

function minimalLetterhead(org: ReportBranding): string {
  const contact = [org.address, org.phone, org.email].filter(Boolean).join(" | ")
  const accentLine = `<div style="width:32px;height:2px;background:${org.accent_color};margin:4px 0 12px;"></div>`
  return `
    <header style="margin-bottom:16px;">
      <div class="org-name" style="font-size:12px;color:#64748b;">${org.org_name}</div>
      ${accentLine}
      ${contact ? `<div class="org-contact">${contact}</div>` : ""}
    </header>
  `
}

export function letterhead(org: ReportBranding): string {
  switch (org.layout) {
    case "modern": return modernLetterhead(org)
    case "bold": return boldLetterhead(org)
    case "minimal": return minimalLetterhead(org)
    default: return classicLetterhead(org)
  }
}

function footer(): string {
  return `<div class="footer">Generated by Pleks · pleks.co.za — ${formatDateShort(new Date())}</div>`
}

export function wrapHTML(title: string, org: ReportBranding, periodStr: string, body: string): string {
  const css = getReportCSS(org)
  const fontLink = getFontLink(org.font)
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${fontLink}<style>${css}</style></head><body>${letterhead(org)}<h1>${title}</h1><div class="period">${periodStr}</div>${body}${footer()}</body></html>`
}

export function buildPortfolioSummaryHTML(data: PortfolioSummaryData, org: ReportBranding): string {
  const period = formatPeriodLabel(data.period.from, data.period.to)
  const outstandingClass = data.outstanding_cents > 0 ? " text-danger" : ""
  const arrearsClass = data.total_arrears_cents > 0 ? " text-danger" : ""
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Units</div><div class="value">${data.total_units}</div></div>
      <div class="metric"><div class="label">Occupied</div><div class="value">${data.occupied_units} <span class="sub">(${data.occupancy_rate}%)</span></div></div>
      <div class="metric"><div class="label">Vacant</div><div class="value">${data.vacant_units}</div></div>
      <div class="metric"><div class="label">Notice</div><div class="value">${data.notice_units}</div></div>
    </div>
    <div class="metric-grid">
      <div class="metric"><div class="label">Expected Income</div><div class="value">${formatZAR(data.expected_income_cents)}</div></div>
      <div class="metric"><div class="label">Collected</div><div class="value">${formatZAR(data.collected_income_cents)} <span class="sub">(${data.collection_rate}%)</span></div></div>
      <div class="metric"><div class="label">Outstanding</div><div class="value${outstandingClass}">${formatZAR(data.outstanding_cents)}</div></div>
      <div class="metric"><div class="label">Total Arrears</div><div class="value${arrearsClass}">${formatZAR(data.total_arrears_cents)}</div></div>
    </div>
    <h2>Per Property</h2>
    <table>
      <tr><th>Property</th><th>Units</th><th>Occupied</th><th class="text-right">Collection</th><th class="text-right">Maintenance</th></tr>
      ${data.properties.map((p) => `<tr>
        <td>${p.property_name}</td><td>${p.total_units}</td><td>${p.occupied_units} (${p.occupancy_rate}%)</td>
        <td class="text-right">${p.collection_rate}%</td><td class="text-right">${formatZAR(p.maintenance_spend_cents)}</td>
      </tr>`).join("")}
    </table>
  `
  return wrapHTML("Portfolio Performance", org, period, body)
}

export function buildRentRollHTML(data: RentRollData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const arrearsClass = data.total_arrears_cents > 0 ? " text-danger" : ""
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Units</div><div class="value">${data.total_units}</div></div>
      <div class="metric"><div class="label">Occupied</div><div class="value">${data.occupied_units} (${data.occupancy_rate}%)</div></div>
      <div class="metric"><div class="label">Monthly Rent</div><div class="value">${formatZAR(data.total_monthly_rent_cents)}</div></div>
      <div class="metric"><div class="label">Arrears</div><div class="value${arrearsClass}">${formatZAR(data.total_arrears_cents)}</div></div>
    </div>
    <table>
      <tr><th>Property</th><th>Unit</th><th>Tenant</th><th class="text-right">Rent/mo</th><th>Dates</th><th>Method</th><th>Status</th><th class="text-right">Arrears</th></tr>
      ${data.rows.map((r) => {
        const m2mSuffix = r.lease_start ? " (M2M)" : ""
        const endSuffix = r.lease_end ? ` – ${formatDateShort(r.lease_end)}` : m2mSuffix
        const leaseDates = r.lease_start ? `${formatDateShort(r.lease_start)}${endSuffix}` : "—"
        const rowArrearsClass = r.arrears_cents > 0 ? " text-danger" : ""
        const rentStr = r.monthly_rent_cents ? formatZAR(r.monthly_rent_cents) : "—"
        const arrearsStr = r.arrears_cents ? formatZAR(r.arrears_cents) : "—"
        return `<tr>
          <td>${r.property_name}</td><td>${r.unit_number}</td><td>${r.tenant_name ?? "VACANT"}</td>
          <td class="text-right">${rentStr}</td><td>${leaseDates}</td>
          <td>${r.payment_method || "—"}</td><td>${r.status}</td>
          <td class="text-right${rowArrearsClass}">${arrearsStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Rent Roll", org, periodStr, body)
}

export function buildArrearsAgingHTML(data: ArrearsAgingData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Tenants in Arrears</div><div class="value">${data.tenants_in_arrears}</div></div>
      <div class="metric"><div class="label">0-30 days</div><div class="value text-warning">${formatZAR(data.total_30d_cents)}</div></div>
      <div class="metric"><div class="label">31-60 days</div><div class="value text-warning">${formatZAR(data.total_60d_cents)}</div></div>
      <div class="metric"><div class="label">90+ days</div><div class="value text-danger">${formatZAR(data.total_90plus_cents)}</div></div>
    </div>
    <table>
      <tr><th>Tenant</th><th>Contact</th><th>Unit</th><th>Property</th><th class="text-right">0-30d</th><th class="text-right">31-60d</th><th class="text-right">61-90d</th><th class="text-right">90d+</th><th class="text-right">Total</th><th>Step</th><th>Last Payment</th></tr>
      ${data.cases.map((c) => {
        const b30 = c.arrears_30d_cents ? formatZAR(c.arrears_30d_cents) : "—"
        const b60 = c.arrears_60d_cents ? formatZAR(c.arrears_60d_cents) : "—"
        const b90 = c.arrears_90d_cents ? formatZAR(c.arrears_90d_cents) : "—"
        const b90p = c.arrears_90plus_cents ? formatZAR(c.arrears_90plus_cents) : "—"
        const contact = c.phone ?? c.email ?? "—"
        return `<tr>
          <td>${c.tenant_name}</td><td>${contact}</td><td>${c.unit_number}</td><td>${c.property_name}</td>
          <td class="text-right">${b30}</td><td class="text-right">${b60}</td>
          <td class="text-right">${b90}</td><td class="text-right">${b90p}</td>
          <td class="text-right">${formatZAR(c.total_cents)}</td>
          <td>Step ${c.current_step}</td>
          <td>${c.last_payment_date ?? "None"}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Arrears Aging Report", org, periodStr, body)
}

export function buildIncomeCollectionHTML(data: IncomeCollectionData, org: ReportBranding): string {
  const period = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Expected</div><div class="value">${formatZAR(data.expected_income_cents)}</div></div>
      <div class="metric"><div class="label">Collected</div><div class="value">${formatZAR(data.collected_income_cents)} (${data.collection_rate}%)</div></div>
      <div class="metric"><div class="label">Outstanding</div><div class="value text-danger">${formatZAR(data.outstanding_cents)}</div></div>
      <div class="metric"><div class="label">DebiCheck</div><div class="value">${formatZAR(data.debicheck_collected_cents)} (${data.debicheck_count})</div></div>
    </div>
    <table>
      <tr><th>Unit</th><th>Tenant</th><th>Invoice</th><th class="text-right">Expected</th><th class="text-right">Received</th><th>Status</th></tr>
      ${data.invoices.map((inv) => `<tr>
        <td>${inv.unit_number}, ${inv.property_name}</td><td>${inv.tenant_name ?? "—"}</td><td>${inv.invoice_number}</td>
        <td class="text-right">${formatZAR(inv.total_amount_cents)}</td>
        <td class="text-right">${formatZAR(inv.amount_paid_cents)}</td>
        <td>${inv.status}</td>
      </tr>`).join("")}
    </table>
  `
  return wrapHTML("Income Collection Report", org, period, body)
}

export function buildDepositRegisterHTML(data: DepositRegisterData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Deposits Held</div><div class="value">${data.count}</div></div>
      <div class="metric"><div class="label">Total Held</div><div class="value">${formatZAR(data.total_held_cents)}</div></div>
    </div>
    <table>
      <tr><th>Tenant</th><th>Unit</th><th>Property</th><th class="text-right">Amount Held</th><th>Date Received</th><th>Status</th></tr>
      ${data.rows.map((r) => {
        const amountStr = formatZAR(r.amount_cents)
        const dateStr = r.date_received
        return `<tr>
          <td>${r.tenant_name}</td><td>${r.unit_number}</td><td>${r.property_name}</td>
          <td class="text-right">${amountStr}</td><td>${dateStr}</td><td>${r.status}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Deposit Register", org, periodStr, body)
}

export function buildManagementFeeSummaryHTML(data: ManagementFeeSummaryData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Fees</div><div class="value">${formatZAR(data.total_fees_cents)}</div></div>
      <div class="metric"><div class="label">Total VAT</div><div class="value">${formatZAR(data.total_vat_cents)}</div></div>
      <div class="metric"><div class="label">Total Gross</div><div class="value">${formatZAR(data.total_gross_cents)}</div></div>
    </div>
    <table>
      <tr><th>Property</th><th>Period</th><th class="text-right">Fee</th><th class="text-right">VAT</th><th class="text-right">Total</th><th>Status</th></tr>
      ${data.rows.map((r) => {
        const feeStr = formatZAR(r.fee_cents)
        const vatStr = formatZAR(r.vat_cents)
        const totalStr = formatZAR(r.total_cents)
        return `<tr>
          <td>${r.property_name}</td><td>${r.period}</td>
          <td class="text-right">${feeStr}</td><td class="text-right">${vatStr}</td>
          <td class="text-right">${totalStr}</td><td>${r.status}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Management Fee Summary", org, periodStr, body)
}

export function buildExpenseReportHTML(data: ExpenseReportData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Expenses</div><div class="value">${formatZAR(data.total_amount_cents)}</div></div>
    </div>
    <h2>By Category</h2>
    <table>
      <tr><th>Category</th><th class="text-right">Expenses</th><th class="text-right">Amount</th></tr>
      ${data.by_category.map((c) => {
        const amountStr = formatZAR(c.amount_cents)
        return `<tr>
          <td>${c.category}</td><td class="text-right">${c.count}</td><td class="text-right">${amountStr}</td>
        </tr>`
      }).join("")}
    </table>
    <h2>Detail</h2>
    <table>
      <tr><th>Date</th><th>Description</th><th>Property</th><th>Category</th><th>SARS Code</th><th class="text-right">Amount</th></tr>
      ${data.rows.map((r) => {
        const amountStr = formatZAR(r.amount_cents)
        return `<tr>
          <td>${r.date}</td><td>${r.description}</td><td>${r.property_name}</td>
          <td>${r.category}</td><td>${r.sars_code ?? "—"}</td><td class="text-right">${amountStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Expense Report", org, periodStr, body)
}

export function buildVatSummaryHTML(data: VatSummaryData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Output VAT</div><div class="value">${formatZAR(data.output_vat_cents)}</div></div>
      <div class="metric"><div class="label">Input VAT</div><div class="value">${formatZAR(data.input_vat_cents)}</div></div>
      <div class="metric"><div class="label">Net VAT</div><div class="value">${formatZAR(data.net_vat_cents)}</div></div>
    </div>
    <h2>Output VAT</h2>
    <table>
      <tr><th>Description</th><th class="text-right">Net</th><th class="text-right">VAT</th></tr>
      ${data.output_lines.map((l) => {
        const netStr = formatZAR(l.net_cents)
        const vatStr = formatZAR(l.vat_cents)
        return `<tr><td>${l.description}</td><td class="text-right">${netStr}</td><td class="text-right">${vatStr}</td></tr>`
      }).join("")}
    </table>
    <h2>Input VAT</h2>
    <table>
      <tr><th>Description</th><th class="text-right">Net</th><th class="text-right">VAT</th></tr>
      ${data.input_lines.map((l) => {
        const netStr = formatZAR(l.net_cents)
        const vatStr = formatZAR(l.vat_cents)
        return `<tr><td>${l.description}</td><td class="text-right">${netStr}</td><td class="text-right">${vatStr}</td></tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("VAT Summary", org, periodStr, body)
}

export function buildTrustReconciliationHTML(data: TrustReconciliationData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Opening Balance</div><div class="value">${formatZAR(data.opening_balance_cents)}</div></div>
      <div class="metric"><div class="label">Total Credits</div><div class="value">${formatZAR(data.total_credits_cents)}</div></div>
      <div class="metric"><div class="label">Total Debits</div><div class="value">${formatZAR(data.total_debits_cents)}</div></div>
      <div class="metric"><div class="label">Closing Balance</div><div class="value">${formatZAR(data.closing_balance_cents)}</div></div>
    </div>
    <table>
      <tr><th>Date</th><th>Description</th><th>Type</th><th class="text-right">Credit</th><th class="text-right">Debit</th><th>Reference</th></tr>
      ${data.rows.map((r) => {
        const creditStr = r.credit_cents ? formatZAR(r.credit_cents) : "—"
        const debitStr = r.debit_cents ? formatZAR(r.debit_cents) : "—"
        return `<tr>
          <td>${r.date}</td><td>${r.description}</td><td>${r.type}</td>
          <td class="text-right">${creditStr}</td><td class="text-right">${debitStr}</td>
          <td>${r.reference ?? "—"}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Trust Reconciliation", org, periodStr, body)
}

export function buildTenantPaymentHistoryHTML(data: TenantPaymentHistoryData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Invoiced</div><div class="value">${formatZAR(data.total_invoiced_cents)}</div></div>
      <div class="metric"><div class="label">Total Paid</div><div class="value">${formatZAR(data.total_paid_cents)}</div></div>
      <div class="metric"><div class="label">Outstanding</div><div class="value text-danger">${formatZAR(data.total_outstanding_cents)}</div></div>
    </div>
    <table>
      <tr><th>Tenant</th><th>Unit</th><th>Property</th><th class="text-right">Invoiced</th><th class="text-right">Paid</th><th class="text-right">Balance</th><th>Last Payment</th><th class="text-right">Count</th></tr>
      ${data.rows.map((r) => {
        const invoicedStr = formatZAR(r.total_invoiced_cents)
        const paidStr = formatZAR(r.total_paid_cents)
        const balanceStr = formatZAR(r.balance_cents)
        const balanceClass = r.balance_cents > 0 ? " text-danger" : ""
        const lastPayment = r.last_payment_date ?? "—"
        return `<tr>
          <td>${r.tenant_name}</td><td>${r.unit_number}</td><td>${r.property_name}</td>
          <td class="text-right">${invoicedStr}</td><td class="text-right">${paidStr}</td>
          <td class="text-right${balanceClass}">${balanceStr}</td>
          <td>${lastPayment}</td><td class="text-right">${r.payment_count}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Tenant Payment History", org, periodStr, body)
}

export function buildDebitOrderReportHTML(data: DebitOrderReportData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Mandates</div><div class="value">${data.total_mandates}</div></div>
      <div class="metric"><div class="label">Active Mandates</div><div class="value">${data.active_mandates}</div></div>
      <div class="metric"><div class="label">Total Amount</div><div class="value">${formatZAR(data.total_amount_cents)}</div></div>
    </div>
    <table>
      <tr><th>Tenant</th><th>Unit</th><th>Property</th><th class="text-right">Amount</th><th>Status</th><th>Last Collection</th><th>Next Collection</th></tr>
      ${data.rows.map((r) => {
        const amountStr = formatZAR(r.amount_cents)
        const lastCollection = r.last_collection_date ?? "—"
        const nextCollection = r.next_collection_date ?? "—"
        return `<tr>
          <td>${r.tenant_name}</td><td>${r.unit_number}</td><td>${r.property_name}</td>
          <td class="text-right">${amountStr}</td><td>${r.status}</td>
          <td>${lastCollection}</td><td>${nextCollection}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Debit Order Report", org, periodStr, body)
}

export function buildTenantDirectoryHTML(data: TenantDirectoryData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Active Tenants</div><div class="value">${data.total_active}</div></div>
    </div>
    <table>
      <tr><th>Tenant</th><th>Role</th><th>Email</th><th>Phone</th><th>Unit</th><th>Property</th><th>Lease End</th><th class="text-right">Monthly Rent</th></tr>
      ${data.rows.map((r) => {
        const isCo = r.role !== "Primary"
        const leaseEnd = r.lease_end ?? "—"
        const rentStr = formatZAR(r.monthly_rent_cents)
        return `<tr${isCo ? ' class="co-tenant"' : ""}>
          <td>${r.tenant_name}</td><td>${r.role}</td><td>${r.email ?? "—"}</td><td>${r.phone ?? "—"}</td>
          <td>${isCo ? "" : r.unit_number}</td><td>${isCo ? "" : r.property_name}</td>
          <td>${isCo ? "" : leaseEnd}</td><td class="text-right">${isCo ? "" : rentStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Tenant Directory", org, periodStr, body)
}

export function buildPropertyPerformanceHTML(data: PropertyPerformanceData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Gross Income</div><div class="value">${formatZAR(data.total_gross_cents)}</div></div>
      <div class="metric"><div class="label">Total Expenses</div><div class="value">${formatZAR(data.total_expenses_cents)}</div></div>
      <div class="metric"><div class="label">Net Income</div><div class="value">${formatZAR(data.total_net_cents)}</div></div>
    </div>
    <table>
      <tr><th>Property</th><th class="text-right">Units</th><th class="text-right">Occupancy %</th><th class="text-right">Gross Income</th><th class="text-right">Expenses</th><th class="text-right">Net Income</th></tr>
      ${data.rows.map((r) => {
        const grossStr = formatZAR(r.gross_income_cents)
        const expStr = formatZAR(r.total_expenses_cents)
        const netStr = formatZAR(r.net_income_cents)
        const netClass = r.net_income_cents < 0 ? " text-danger" : ""
        return `<tr>
          <td>${r.property_name}</td><td class="text-right">${r.units}</td>
          <td class="text-right">${r.occupancy_rate}%</td>
          <td class="text-right">${grossStr}</td><td class="text-right">${expStr}</td>
          <td class="text-right${netClass}">${netStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Property Performance", org, periodStr, body)
}

export function buildVacancyAnalysisHTML(data: VacancyAnalysisData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Vacant</div><div class="value">${data.total_vacant}</div></div>
      <div class="metric"><div class="label">Avg Days Vacant</div><div class="value">${data.average_days_vacant}</div></div>
      <div class="metric"><div class="label">Est. Lost Income</div><div class="value text-danger">${formatZAR(data.total_estimated_lost_cents)}</div></div>
    </div>
    <table>
      <tr><th>Unit</th><th>Property</th><th class="text-right">Days Vacant</th><th class="text-right">Monthly Rent</th><th class="text-right">Est. Lost Income</th></tr>
      ${data.currently_vacant.map((r) => {
        const rentStr = formatZAR(r.monthly_rent_cents)
        const lostStr = formatZAR(r.estimated_lost_cents)
        return `<tr>
          <td>${r.unit_number}</td><td>${r.property_name}</td>
          <td class="text-right">${r.days_vacant}</td>
          <td class="text-right">${rentStr}</td><td class="text-right text-danger">${lostStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Vacancy Analysis", org, periodStr, body)
}

export function buildMunicipalCostsHTML(data: MunicipalCostsData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Water</div><div class="value">${formatZAR(data.total_water_cents)}</div></div>
      <div class="metric"><div class="label">Electricity</div><div class="value">${formatZAR(data.total_electricity_cents)}</div></div>
      <div class="metric"><div class="label">Rates</div><div class="value">${formatZAR(data.total_rates_cents)}</div></div>
      <div class="metric"><div class="label">Total</div><div class="value">${formatZAR(data.total_amount_cents)}</div></div>
    </div>
    <table>
      <tr><th>Property</th><th>Period</th><th class="text-right">Water</th><th class="text-right">Electricity</th><th class="text-right">Rates</th><th class="text-right">Refuse</th><th class="text-right">Total</th></tr>
      ${data.rows.map((r) => {
        const waterStr = formatZAR(r.water_cents)
        const elecStr = formatZAR(r.electricity_cents)
        const ratesStr = formatZAR(r.rates_cents)
        const refuseStr = formatZAR(r.refuse_cents)
        const totalStr = formatZAR(r.total_cents)
        return `<tr>
          <td>${r.property_name}</td><td>${r.period}</td>
          <td class="text-right">${waterStr}</td><td class="text-right">${elecStr}</td>
          <td class="text-right">${ratesStr}</td><td class="text-right">${refuseStr}</td>
          <td class="text-right">${totalStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Municipal Costs", org, periodStr, body)
}

export function buildCpaNoticeScheduleHTML(data: CpaNoticeScheduleData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Overdue</div><div class="value text-danger">${data.overdue_count}</div></div>
      <div class="metric"><div class="label">Due This Week</div><div class="value text-warning">${data.due_this_week}</div></div>
      <div class="metric"><div class="label">Due in 30 Days</div><div class="value">${data.due_30d}</div></div>
    </div>
    <table>
      <tr><th>Tenant</th><th>Unit</th><th>Property</th><th>Lease End</th><th class="text-right">Days Remaining</th><th>Notice Due By</th><th>Status</th></tr>
      ${data.rows.map((r) => {
        const leaseEnd = r.lease_end
        const noticeDue = r.notice_due_by
        let daysClass = ""
        if (r.days_remaining < 0) daysClass = " text-danger"
        else if (r.days_remaining <= 7) daysClass = " text-warning"
        return `<tr>
          <td>${r.tenant_name}</td><td>${r.unit_number}</td><td>${r.property_name}</td>
          <td>${leaseEnd}</td><td class="text-right${daysClass}">${r.days_remaining}</td>
          <td>${noticeDue}</td><td>${r.status}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("CPA Notice Schedule", org, periodStr, body)
}

export function buildInspectionScheduleHTML(data: InspectionScheduleData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Upcoming</div><div class="value">${data.upcoming_count}</div></div>
      <div class="metric"><div class="label">Overdue</div><div class="value text-danger">${data.overdue_count}</div></div>
    </div>
    <table>
      <tr><th>Unit</th><th>Property</th><th>Type</th><th>Scheduled Date</th><th>Status</th><th class="text-right">Days Overdue</th></tr>
      ${data.rows.map((r) => {
        const scheduledDate = r.scheduled_date
        const overdueClass = r.days_overdue > 0 ? " text-danger" : ""
        const overdueStr = r.days_overdue > 0 ? r.days_overdue.toString() : "—"
        return `<tr>
          <td>${r.unit_number}</td><td>${r.property_name}</td><td>${r.type}</td>
          <td>${scheduledDate}</td><td>${r.status}</td>
          <td class="text-right${overdueClass}">${overdueStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Inspection Schedule", org, periodStr, body)
}

export function buildPopiaConsentAuditHTML(data: PopiaConsentAuditData, org: ReportBranding): string {
  const periodStr = `As at ${formatDateShort(data.as_at)}`
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Records</div><div class="value">${data.total_records}</div></div>
    </div>
    <h2>By Type</h2>
    <table>
      <tr><th>Type</th><th class="text-right">Count</th></tr>
      ${data.by_type.map((t) => {
        return `<tr><td>${t.consent_type}</td><td class="text-right">${t.count}</td></tr>`
      }).join("")}
    </table>
    <h2>Records</h2>
    <table>
      <tr><th>Tenant</th><th>Consent Type</th><th>Granted At</th><th>Version</th></tr>
      ${data.rows.map((r) => `<tr>
          <td>${r.tenant_name}</td><td>${r.consent_type}</td>
          <td>${r.granted_at}</td><td>${r.version ?? "—"}</td>
        </tr>`).join("")}
    </table>
  `
  return wrapHTML("POPIA Consent Audit", org, periodStr, body)
}

export function buildContractorPerformanceHTML(data: ContractorPerformanceData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Contractors</div><div class="value">${data.total_contractors}</div></div>
      <div class="metric"><div class="label">Total Spend</div><div class="value">${formatZAR(data.total_spend_cents)}</div></div>
    </div>
    <table>
      <tr><th>Contractor</th><th>Trade</th><th class="text-right">Assigned</th><th class="text-right">Completed</th><th class="text-right">Completion %</th><th class="text-right">Total Spend</th></tr>
      ${data.rows.map((r) => {
        const completionPct = (r.jobs_assigned > 0 ? Math.round(r.jobs_completed / r.jobs_assigned * 100) : 0).toString() + "%"
        const spendStr = formatZAR(r.total_spend_cents)
        return `<tr>
          <td>${r.contractor_name}</td><td>${r.trade}</td>
          <td class="text-right">${r.jobs_assigned}</td><td class="text-right">${r.jobs_completed}</td>
          <td class="text-right">${completionPct}</td><td class="text-right">${spendStr}</td>
        </tr>`
      }).join("")}
    </table>
  `
  return wrapHTML("Contractor Performance", org, periodStr, body)
}

export function buildMaintenanceSlaHTML(data: MaintenanceSlaData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const emergencyRate = data.emergency.rate + "%"
  const urgentRate = data.urgent.rate + "%"
  const routineRate = data.routine.rate + "%"
  const overallRate = data.overall_compliance_rate + "%"
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Emergency SLA</div><div class="value">${emergencyRate}</div></div>
      <div class="metric"><div class="label">Urgent SLA</div><div class="value">${urgentRate}</div></div>
      <div class="metric"><div class="label">Routine SLA</div><div class="value">${routineRate}</div></div>
      <div class="metric"><div class="label">Overall Compliance</div><div class="value">${overallRate}</div></div>
    </div>
    <h2>SLA Summary</h2>
    <table>
      <tr><th>Level</th><th>Target</th><th class="text-right">Total</th><th class="text-right">Met</th><th class="text-right">Breached</th><th class="text-right">Rate</th></tr>
      ${[
        { label: "Emergency", target: "4h", sla: data.emergency },
        { label: "Urgent", target: "24h", sla: data.urgent },
        { label: "Routine", target: "72h", sla: data.routine },
      ].map(({ label, target, sla }) => {
        let rateClass = " text-success"
        if (sla.rate < 80) rateClass = " text-danger"
        else if (sla.rate < 95) rateClass = " text-warning"
        const breached = sla.total - sla.met
        return `<tr>
          <td>${label}</td><td>${target}</td>
          <td class="text-right">${sla.total}</td><td class="text-right">${sla.met}</td>
          <td class="text-right">${breached}</td>
          <td class="text-right${rateClass}">${sla.rate}%</td>
        </tr>`
      }).join("")}
    </table>
    <h2>Breaches</h2>
    <table>
      <tr><th>Work Order</th><th>Property</th><th>Category</th><th>Urgency</th><th class="text-right">Target (h)</th><th class="text-right">Actual (h)</th></tr>
      ${data.breaches.map((b) => `<tr>
          <td>${b.work_order_number}</td><td>${b.property_name}</td>
          <td>${b.category}</td><td>${b.urgency}</td>
          <td class="text-right">${b.sla_target_hours}</td><td class="text-right text-danger">${b.actual_hours}</td>
        </tr>`).join("")}
    </table>
  `
  return wrapHTML("Maintenance SLA Report", org, periodStr, body)
}

export function buildOccupancyHTML(data: OccupancyData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Units</div><div class="value">${data.totals.total_units}</div></div>
      <div class="metric"><div class="label">Occupied</div><div class="value">${data.totals.occupied_units}</div></div>
      <div class="metric"><div class="label">Vacant</div><div class="value">${data.totals.vacant_units}</div></div>
      <div class="metric"><div class="label">Occupancy Rate</div><div class="value">${data.totals.occupancy_rate}%</div></div>
    </div>
    <h2>By Property</h2>
    <table>
      <tr><th>Property</th><th class="text-right">Total</th><th class="text-right">Occupied</th><th class="text-right">Vacant</th><th class="text-right">On Notice</th><th class="text-right">Rate</th></tr>
      ${data.rows.map((r) => `<tr>
        <td>${r.property_name}</td>
        <td class="text-right">${r.total_units}</td><td class="text-right">${r.occupied_units}</td>
        <td class="text-right">${r.vacant_units}</td><td class="text-right">${r.notice_units}</td>
        <td class="text-right">${r.occupancy_rate}%</td>
      </tr>`).join("")}
    </table>
    ${data.vacancies.length > 0 ? `
    <h2>Current Vacancies</h2>
    <table>
      <tr><th>Unit</th><th>Property</th><th class="text-right">Days Vacant</th></tr>
      ${data.vacancies.map((v) => `<tr>
        <td>${v.unit_number}</td><td>${v.property_name}</td>
        <td class="text-right">${v.days_vacant}</td>
      </tr>`).join("")}
    </table>` : ""}
  `
  return wrapHTML("Occupancy Report", org, periodStr, body)
}

export function buildMaintenanceCostHTML(data: MaintenanceCostData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Total Jobs</div><div class="value">${data.total_jobs}</div></div>
      <div class="metric"><div class="label">Total Spend</div><div class="value">${formatZAR(data.total_spend_cents)}</div></div>
    </div>
    <h2>By Category</h2>
    <table>
      <tr><th>Category</th><th class="text-right">Jobs</th><th class="text-right">Spend</th><th class="text-right">%</th></tr>
      ${data.by_category.map((c) => `<tr>
        <td>${c.category}</td><td class="text-right">${c.jobs}</td>
        <td class="text-right">${formatZAR(c.spend_cents)}</td><td class="text-right">${c.percent}%</td>
      </tr>`).join("")}
    </table>
    <h2>Work Orders</h2>
    <table>
      <tr><th>Work Order</th><th>Property</th><th>Unit</th><th>Category</th><th>Contractor</th><th class="text-right">Cost</th></tr>
      ${data.jobs.map((j) => `<tr>
        <td class="font-mono">${j.work_order_number}</td><td>${j.property_name}</td>
        <td>${j.unit_number}</td><td>${j.category}</td><td>${j.contractor_name}</td>
        <td class="text-right">${formatZAR(j.actual_cost_cents)}</td>
      </tr>`).join("")}
    </table>
  `
  return wrapHTML("Maintenance Costs", org, periodStr, body)
}

export function buildLeaseExpiryHTML(data: LeaseExpiryData, org: ReportBranding): string {
  const asAt = formatDateShort(data.as_at)
  function leaseTable(rows: LeaseExpiryData["expiring_30d"], title: string): string {
    if (rows.length === 0) return ""
    return `
      <h2>${title}</h2>
      <table>
        <tr><th>Tenant</th><th>Unit</th><th>Property</th><th class="text-right">Rent</th><th>Lease End</th><th>Status</th></tr>
        ${rows.map((r) => `<tr>
          <td>${r.tenant_name}</td><td>${r.unit_number}</td><td>${r.property_name}</td>
          <td class="text-right">${formatZAR(r.rent_amount_cents)}</td>
          <td>${r.lease_end ? formatDateShort(r.lease_end) : "—"}</td>
          <td>${r.renewal_status}</td>
        </tr>`).join("")}
      </table>`
  }
  const body = `
    <p style="margin-bottom:12px;font-size:10px;color:#666">As at ${asAt} · Action required: ${data.action_required}</p>
    ${leaseTable(data.expiring_30d, "Expiring within 30 days")}
    ${leaseTable(data.expiring_60d, "Expiring 31–60 days")}
    ${leaseTable(data.expiring_90d, "Expiring 61–90 days")}
    ${leaseTable(data.month_to_month, "Month-to-month")}
  `
  return wrapHTML("Lease Expiry Report", org, asAt, body)
}

export function buildApplicationPipelineHTML(data: ApplicationPipelineData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Applications</div><div class="value">${data.applications_submitted}</div></div>
      <div class="metric"><div class="label">Approved</div><div class="value">${data.approved}</div></div>
      <div class="metric"><div class="label">Leases Signed</div><div class="value">${data.lease_signed}</div></div>
      <div class="metric"><div class="label">Fee Revenue</div><div class="value">${formatZAR(data.revenue_from_fees_cents)}</div></div>
    </div>
    <h2>FitScore Distribution</h2>
    <table>
      <tr><th>Range</th><th class="text-right">Count</th></tr>
      ${data.fitscore_distribution.map((f) => `<tr>
        <td>${f.range}</td><td class="text-right">${f.count}</td>
      </tr>`).join("")}
    </table>
    <h2>By Listing</h2>
    <table>
      <tr><th>Property</th><th>Unit</th><th class="text-right">Views</th><th class="text-right">Applications</th><th class="text-right">Approved</th></tr>
      ${data.listings.map((l) => `<tr>
        <td>${l.property_name}</td><td>${l.unit_number}</td>
        <td class="text-right">${l.views}</td><td class="text-right">${l.applications}</td>
        <td class="text-right">${l.approved}</td>
      </tr>`).join("")}
    </table>
  `
  return wrapHTML("Application Pipeline", org, periodStr, body)
}

export function buildOwnerPortfolioHTML(data: OwnerPortfolioData, org: ReportBranding): string {
  const periodStr = formatPeriodLabel(data.period.from, data.period.to)
  const body = `
    <div class="metric-grid">
      <div class="metric"><div class="label">Gross Income</div><div class="value">${formatZAR(data.total_income_cents)}</div></div>
      <div class="metric"><div class="label">Expenses</div><div class="value">${formatZAR(data.total_expenses_cents)}</div></div>
      <div class="metric"><div class="label">Net to Owners</div><div class="value">${formatZAR(data.total_net_cents)}</div></div>
      <div class="metric"><div class="label">Deposits Held</div><div class="value">${formatZAR(data.total_deposits_cents)}</div></div>
    </div>
    <table>
      <tr><th>Owner</th><th>Property</th><th class="text-right">Units</th><th class="text-right">Gross</th><th class="text-right">Expenses</th><th class="text-right">Net</th><th class="text-right">Deposits</th></tr>
      ${data.owners.map((r) => `<tr>
        <td>${r.owner_name}</td><td>${r.property_name}</td><td class="text-right">${r.units}</td>
        <td class="text-right">${formatZAR(r.gross_income_cents)}</td>
        <td class="text-right">${formatZAR(r.expenses_cents)}</td>
        <td class="text-right">${formatZAR(r.net_to_owner_cents)}</td>
        <td class="text-right">${formatZAR(r.deposits_held_cents)}</td>
      </tr>`).join("")}
    </table>
  `
  return wrapHTML("Owner Portfolio", org, periodStr, body)
}
