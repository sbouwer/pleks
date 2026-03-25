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

// Report tier access
export const REPORT_TIER_ACCESS: Record<ReportType, string[]> = {
  portfolio_summary: ["owner", "steward", "portfolio", "firm"],
  occupancy: ["steward", "portfolio", "firm"],
  income_collection: ["steward", "portfolio", "firm"],
  arrears_aging: ["steward", "portfolio", "firm"],
  maintenance_costs: ["steward", "portfolio", "firm"],
  lease_expiry: ["portfolio", "firm"],
  rent_roll: ["steward", "portfolio", "firm"],
  application_pipeline: ["firm"],
  owner_portfolio: ["portfolio", "firm"],
  annual_tax_summary: ["portfolio", "firm"],
}

export const REPORT_LABELS: Record<ReportType, string> = {
  portfolio_summary: "Portfolio Summary",
  occupancy: "Occupancy",
  income_collection: "Income Collection",
  arrears_aging: "Arrears Aging",
  maintenance_costs: "Maintenance Costs",
  lease_expiry: "Lease Expiry",
  rent_roll: "Rent Roll",
  application_pipeline: "Application Pipeline",
  owner_portfolio: "Owner Portfolio",
  annual_tax_summary: "Annual Tax Summary",
}
