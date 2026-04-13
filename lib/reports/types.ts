export type ReportPeriodType =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_tax_year"
  | "last_tax_year"
  | "custom"

export type ReportType =
  | "portfolio_summary"
  | "occupancy"
  | "income_collection"
  | "arrears_aging"
  | "maintenance_costs"
  | "lease_expiry"
  | "application_pipeline"
  | "owner_portfolio"
  | "rent_roll"
  | "annual_tax_summary"
  // New in BUILD_52
  | "deposit_register"
  | "management_fee_summary"
  | "expense_report"
  | "vat_summary"
  | "trust_reconciliation"
  | "tenant_payment_history"
  | "debit_order_report"
  | "tenant_directory"
  | "property_performance"
  | "vacancy_analysis"
  | "municipal_costs"
  | "cpa_notice_schedule"
  | "inspection_schedule"
  | "popia_consent_audit"
  | "contractor_performance"
  | "maintenance_sla"

export interface ReportFilters {
  orgId: string
  from: Date
  to: Date
  propertyIds?: string[]
}

export interface PropertySummary {
  property_id: string
  property_name: string
  total_units: number
  occupied_units: number
  vacant_units: number
  notice_units: number
  occupancy_rate: number
  expected_income_cents: number
  collected_income_cents: number
  collection_rate: number
  arrears_cents: number
  maintenance_spend_cents: number
}

export interface PortfolioSummaryData {
  period: { from: Date; to: Date }
  total_units: number
  occupied_units: number
  vacant_units: number
  notice_units: number
  occupancy_rate: number
  expected_income_cents: number
  collected_income_cents: number
  collection_rate: number
  outstanding_cents: number
  tenants_in_arrears: number
  total_arrears_cents: number
  arrears_30d_cents: number
  arrears_60d_cents: number
  arrears_90plus_cents: number
  open_jobs: number
  jobs_overdue_sla: number
  maintenance_spend_cents: number
  expiring_30d: number
  expiring_60d: number
  expiring_90d: number
  properties: PropertySummary[]
}

export interface OccupancyRow {
  property_id: string
  property_name: string
  total_units: number
  occupied_units: number
  vacant_units: number
  notice_units: number
  occupancy_rate: number
}

export interface OccupancyData {
  period: { from: Date; to: Date }
  rows: OccupancyRow[]
  totals: OccupancyRow
  vacancies: VacancyDetail[]
  average_vacancy_days: number
}

export interface VacancyDetail {
  unit_id: string
  unit_number: string
  property_name: string
  vacant_since: Date
  days_vacant: number
}

export interface IncomeCollectionRow {
  unit_id: string
  unit_number: string
  property_name: string
  tenant_name: string | null
  invoice_number: string
  period_from: Date
  period_to: Date
  total_amount_cents: number
  amount_paid_cents: number
  status: string
  payment_date: Date | null
  payment_method: string | null
}

export interface IncomeCollectionData {
  period: { from: Date; to: Date }
  invoices: IncomeCollectionRow[]
  expected_income_cents: number
  collected_income_cents: number
  outstanding_cents: number
  collection_rate: number
  debicheck_collected_cents: number
  debicheck_count: number
  eft_collected_cents: number
  eft_count: number
}

export interface ArrearsAgingRow {
  tenant_id: string
  tenant_name: string
  unit_number: string
  property_name: string
  arrears_30d_cents: number
  arrears_60d_cents: number
  arrears_90d_cents: number
  arrears_90plus_cents: number
  total_cents: number
  current_step: number
  status: string
}

export interface ArrearsAgingData {
  as_at: Date
  cases: ArrearsAgingRow[]
  total_30d_cents: number
  total_60d_cents: number
  total_90d_cents: number
  total_90plus_cents: number
  total_arrears_cents: number
  tenants_in_arrears: number
}

export interface MaintenanceCostRow {
  work_order_number: string
  property_name: string
  unit_number: string
  category: string
  contractor_name: string
  completed_at: Date | null
  actual_cost_cents: number
}

export interface MaintenanceCostData {
  period: { from: Date; to: Date }
  jobs: MaintenanceCostRow[]
  by_category: { category: string; jobs: number; spend_cents: number; percent: number }[]
  by_property: { property_name: string; jobs: number; spend_cents: number; per_unit_cents: number; total_units: number }[]
  total_spend_cents: number
  total_jobs: number
  sla_performance: { emergency: { total: number; met: number }; urgent: { total: number; met: number }; routine: { total: number; met: number } }
}

export interface LeaseExpiryRow {
  lease_id: string
  unit_number: string
  property_name: string
  tenant_name: string
  lease_end: Date | null
  rent_amount_cents: number
  is_fixed_term: boolean
  days_to_expiry: number | null
  status: string
  renewal_status: string
}

export interface LeaseExpiryData {
  as_at: Date
  expiring_30d: LeaseExpiryRow[]
  expiring_60d: LeaseExpiryRow[]
  expiring_90d: LeaseExpiryRow[]
  month_to_month: LeaseExpiryRow[]
  action_required: number
}

export interface RentRollRow {
  property_name: string
  unit_number: string
  tenant_name: string | null
  lease_start: Date | null
  lease_end: Date | null
  lease_type: string
  monthly_rent_cents: number
  deposit_held_cents: number
  payment_method: string
  status: string
  days_to_expiry: number | null
  last_payment_date: Date | null
  arrears_cents: number
}

export interface RentRollData {
  as_at: Date
  rows: RentRollRow[]
  total_units: number
  occupied_units: number
  occupancy_rate: number
  total_monthly_rent_cents: number
  total_arrears_cents: number
}

export interface ApplicationPipelineData {
  period: { from: Date; to: Date }
  listing_views: number
  applications_started: number
  applications_submitted: number
  fee_paid: number
  screening_complete: number
  approved: number
  lease_signed: number
  fitscore_distribution: { range: string; count: number }[]
  average_days_to_lease: number
  revenue_from_fees_cents: number
  listings: { listing_id: string; property_name: string; unit_number: string; views: number; applications: number; approved: number }[]
}

export interface OwnerPortfolioRow {
  owner_name: string
  property_name: string
  units: number
  gross_income_cents: number
  expenses_cents: number
  net_to_owner_cents: number
  deposits_held_cents: number
}

export interface OwnerPortfolioData {
  period: { from: Date; to: Date }
  owners: OwnerPortfolioRow[]
  total_income_cents: number
  total_expenses_cents: number
  total_net_cents: number
  total_deposits_cents: number
  management_fee_income_cents: number
}

// ── New BUILD_52 types ──────────────────────────────────────────────────────

export interface DepositRegisterRow {
  tenant_name: string
  unit_number: string
  property_name: string
  amount_cents: number
  date_received: string
  status: string
}

export interface DepositRegisterData {
  as_at: Date
  rows: DepositRegisterRow[]
  total_held_cents: number
  count: number
}

export interface ManagementFeeRow {
  property_name: string
  period: string
  fee_cents: number
  vat_cents: number
  total_cents: number
  status: string
}

export interface ManagementFeeSummaryData {
  period: { from: Date; to: Date }
  rows: ManagementFeeRow[]
  total_fees_cents: number
  total_vat_cents: number
  total_gross_cents: number
}

export interface ExpenseRow {
  date: string
  description: string
  property_name: string
  category: string
  sars_code: string
  supplier: string
  amount_cents: number
}

export interface ExpenseReportData {
  period: { from: Date; to: Date }
  rows: ExpenseRow[]
  by_category: { category: string; amount_cents: number; count: number }[]
  total_amount_cents: number
}

export interface VatSummaryData {
  period: { from: Date; to: Date }
  output_vat_cents: number
  input_vat_cents: number
  net_vat_cents: number
  output_lines: { description: string; net_cents: number; vat_cents: number }[]
  input_lines: { description: string; net_cents: number; vat_cents: number }[]
}

export interface TrustReconRow {
  date: string
  description: string
  type: string
  credit_cents: number
  debit_cents: number
  reference: string | null
}

export interface TrustReconciliationData {
  period: { from: Date; to: Date }
  opening_balance_cents: number
  closing_balance_cents: number
  total_credits_cents: number
  total_debits_cents: number
  rows: TrustReconRow[]
}

export interface TenantPaymentHistoryRow {
  tenant_name: string
  unit_number: string
  property_name: string
  total_invoiced_cents: number
  total_paid_cents: number
  balance_cents: number
  last_payment_date: string | null
  payment_count: number
}

export interface TenantPaymentHistoryData {
  period: { from: Date; to: Date }
  rows: TenantPaymentHistoryRow[]
  total_invoiced_cents: number
  total_paid_cents: number
  total_outstanding_cents: number
}

export interface DebitOrderRow {
  tenant_name: string
  unit_number: string
  property_name: string
  amount_cents: number
  status: string
  last_collection_date: string | null
  next_collection_date: string | null
}

export interface DebitOrderReportData {
  as_at: Date
  rows: DebitOrderRow[]
  total_mandates: number
  active_mandates: number
  total_amount_cents: number
}

export interface TenantDirectoryRow {
  tenant_name: string
  email: string | null
  phone: string | null
  unit_number: string
  property_name: string
  lease_end: string | null
  monthly_rent_cents: number
}

export interface TenantDirectoryData {
  as_at: Date
  rows: TenantDirectoryRow[]
  total_active: number
}

export interface PropertyPerformanceRow {
  property_id: string
  property_name: string
  units: number
  occupied_units: number
  gross_income_cents: number
  total_expenses_cents: number
  net_income_cents: number
  maintenance_spend_cents: number
  occupancy_rate: number
}

export interface PropertyPerformanceData {
  period: { from: Date; to: Date }
  rows: PropertyPerformanceRow[]
  total_gross_cents: number
  total_expenses_cents: number
  total_net_cents: number
}

export interface VacancyRow {
  unit_id: string
  unit_number: string
  property_name: string
  days_vacant: number
  monthly_rent_cents: number
  estimated_lost_cents: number
}

export interface VacancyAnalysisData {
  as_at: Date
  currently_vacant: VacancyRow[]
  total_vacant: number
  total_estimated_lost_cents: number
  average_days_vacant: number
}

export interface MunicipalCostRow {
  property_name: string
  period: string
  water_cents: number
  electricity_cents: number
  rates_cents: number
  refuse_cents: number
  total_cents: number
}

export interface MunicipalCostsData {
  period: { from: Date; to: Date }
  rows: MunicipalCostRow[]
  total_water_cents: number
  total_electricity_cents: number
  total_rates_cents: number
  total_refuse_cents: number
  total_amount_cents: number
}

export interface CpaNoticeRow {
  lease_id: string
  tenant_name: string
  unit_number: string
  property_name: string
  lease_end: string
  days_remaining: number
  notice_due_by: string
  status: string
}

export interface CpaNoticeScheduleData {
  as_at: Date
  rows: CpaNoticeRow[]
  overdue_count: number
  due_this_week: number
  due_30d: number
}

export interface InspectionScheduleRow {
  unit_number: string
  property_name: string
  type: string
  scheduled_date: string
  status: string
  days_overdue: number
}

export interface InspectionScheduleData {
  as_at: Date
  rows: InspectionScheduleRow[]
  upcoming_count: number
  overdue_count: number
}

export interface PopiaConsentRow {
  tenant_name: string
  consent_type: string
  granted_at: string
  version: string | null
}

export interface PopiaConsentAuditData {
  as_at: Date
  rows: PopiaConsentRow[]
  total_records: number
  by_type: { consent_type: string; count: number }[]
}

export interface ContractorPerformanceRow {
  contractor_name: string
  trade: string | null
  jobs_assigned: number
  jobs_completed: number
  total_spend_cents: number
}

export interface ContractorPerformanceData {
  period: { from: Date; to: Date }
  rows: ContractorPerformanceRow[]
  total_contractors: number
  total_spend_cents: number
}

export interface MaintenanceSlaRow {
  work_order_number: string
  property_name: string
  category: string
  urgency: string
  sla_target_hours: number
  actual_hours: number | null
  met_sla: boolean
  created_at: string
}

export interface MaintenanceSlaData {
  period: { from: Date; to: Date }
  emergency: { total: number; met: number; rate: number }
  urgent: { total: number; met: number; rate: number }
  routine: { total: number; met: number; rate: number }
  overall_compliance_rate: number
  breaches: MaintenanceSlaRow[]
  all_rows: MaintenanceSlaRow[]
}

// ── Tier access ─────────────────────────────────────────────────────────────

export const REPORT_TIER_ACCESS: Record<ReportType, string[]> = {
  // Owner — 10 reports
  portfolio_summary:       ["owner", "steward", "portfolio", "firm"],
  income_collection:       ["owner", "steward", "portfolio", "firm"],
  tenant_directory:        ["owner", "steward", "portfolio", "firm"],
  rent_roll:               ["owner", "steward", "portfolio", "firm"],
  arrears_aging:           ["owner", "steward", "portfolio", "firm"],
  lease_expiry:            ["owner", "steward", "portfolio", "firm"],
  occupancy:               ["owner", "steward", "portfolio", "firm"],
  maintenance_costs:       ["owner", "steward", "portfolio", "firm"],
  cpa_notice_schedule:     ["owner", "steward", "portfolio", "firm"],
  inspection_schedule:     ["owner", "steward", "portfolio", "firm"],
  // Steward — +10 (total 20)
  expense_report:          ["steward", "portfolio", "firm"],
  management_fee_summary:  ["steward", "portfolio", "firm"],
  deposit_register:        ["steward", "portfolio", "firm"],
  vat_summary:             ["steward", "portfolio", "firm"],
  trust_reconciliation:    ["steward", "portfolio", "firm"],
  property_performance:    ["steward", "portfolio", "firm"],
  vacancy_analysis:        ["steward", "portfolio", "firm"],
  municipal_costs:         ["steward", "portfolio", "firm"],
  tenant_payment_history:  ["steward", "portfolio", "firm"],
  debit_order_report:      ["steward", "portfolio", "firm"],
  // Portfolio — +3 (total 23)
  contractor_performance:  ["portfolio", "firm"],
  maintenance_sla:         ["portfolio", "firm"],
  owner_portfolio:         ["portfolio", "firm"],
  popia_consent_audit:     ["portfolio", "firm"],
  // Firm — +2 (total 25)
  application_pipeline:    ["firm"],
  annual_tax_summary:      ["portfolio", "firm"],
}

export const REPORT_LABELS: Record<ReportType, string> = {
  portfolio_summary:      "Portfolio Summary",
  occupancy:              "Occupancy",
  income_collection:      "Income Collection",
  arrears_aging:          "Arrears Aging",
  maintenance_costs:      "Maintenance Costs",
  lease_expiry:           "Lease Expiry",
  rent_roll:              "Rent Roll",
  application_pipeline:   "Application Pipeline",
  owner_portfolio:        "Owner Portfolio",
  annual_tax_summary:     "Annual Tax Summary",
  deposit_register:       "Deposit Register",
  management_fee_summary: "Management Fee Summary",
  expense_report:         "Expense Report",
  vat_summary:            "VAT Summary",
  trust_reconciliation:   "Trust Reconciliation",
  tenant_payment_history: "Tenant Payment History",
  debit_order_report:     "Debit Order Report",
  tenant_directory:       "Tenant Directory",
  property_performance:   "Property Performance",
  vacancy_analysis:       "Vacancy Analysis",
  municipal_costs:        "Municipal Costs",
  cpa_notice_schedule:    "CPA Notice Schedule",
  inspection_schedule:    "Inspection Schedule",
  popia_consent_audit:    "POPIA Consent Audit",
  contractor_performance: "Contractor Performance",
  maintenance_sla:        "Maintenance SLA",
}

export const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  portfolio_summary:      "Key metrics across your entire portfolio — occupancy, income, arrears, maintenance.",
  occupancy:              "Per-property occupancy rates, vacant units, and units on notice.",
  income_collection:      "Invoice-level view of expected vs collected rent per period.",
  arrears_aging:          "Arrears broken into 0–30d / 31–60d / 61–90d / 90d+ buckets per tenant.",
  maintenance_costs:      "Completed job costs by category and property for the period.",
  lease_expiry:           "Leases expiring in the next 30, 60, and 90 days requiring action.",
  rent_roll:              "Complete unit-by-unit rent, deposit, and payment method snapshot.",
  application_pipeline:   "Application funnel, FitScore distribution, and fee revenue.",
  owner_portfolio:        "Per-owner income, expenses, and net payouts for the period.",
  annual_tax_summary:     "SARS-ready annual income and expense summary by property.",
  deposit_register:       "All deposits currently held — tenant, amount, date received.",
  management_fee_summary: "Management fees earned per property — fee, VAT, and release status.",
  expense_report:         "All property expenses by category with SARS codes and supplier detail.",
  vat_summary:            "Output VAT (fees) vs input VAT (expenses) for the period.",
  trust_reconciliation:   "Trust account credits and debits with opening/closing balance.",
  tenant_payment_history: "Payment and invoice history per tenant for the period.",
  debit_order_report:     "All DebiCheck mandates — status, last collection, and next run date.",
  tenant_directory:       "Contact list of all active tenants with unit and lease end date.",
  property_performance:   "Per-property gross income, expenses, and net income.",
  vacancy_analysis:       "Currently vacant units, days vacant, and estimated lost income.",
  municipal_costs:        "Municipal charges (water, electricity, rates, refuse) per property.",
  cpa_notice_schedule:    "Leases requiring CPA s14 notice in the next 90 days.",
  inspection_schedule:    "Upcoming and overdue inspections by type and property.",
  popia_consent_audit:    "All POPIA consent records by type and date for compliance review.",
  contractor_performance: "Per-contractor job count, completion rate, and total spend.",
  maintenance_sla:        "SLA compliance by urgency — emergency (4h), urgent (24h), routine (72h).",
}
