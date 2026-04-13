import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolvePeriod } from "@/lib/reports/periods"
import { buildPortfolioSummary } from "@/lib/reports/portfolioSummary"
import { buildOccupancyReport } from "@/lib/reports/occupancy"
import { buildIncomeCollectionReport } from "@/lib/reports/incomeCollection"
import { buildArrearsAgingReport } from "@/lib/reports/arrearsAging"
import { buildMaintenanceCostReport } from "@/lib/reports/maintenanceCosts"
import { buildLeaseExpiryReport } from "@/lib/reports/leaseExpiry"
import { buildRentRoll } from "@/lib/reports/rentRoll"
import { buildApplicationPipeline } from "@/lib/reports/applicationPipeline"
import { buildOwnerPortfolio } from "@/lib/reports/ownerPortfolio"
import { buildDepositRegister } from "@/lib/reports/depositRegister"
import { buildManagementFeeSummary } from "@/lib/reports/managementFeeSummary"
import { buildExpenseReport } from "@/lib/reports/expenseReport"
import { buildVatSummary } from "@/lib/reports/vatSummary"
import { buildTrustReconciliation } from "@/lib/reports/trustReconciliation"
import { buildTenantPaymentHistory } from "@/lib/reports/tenantPaymentHistory"
import { buildDebitOrderReport } from "@/lib/reports/debitOrderReport"
import { buildTenantDirectory } from "@/lib/reports/tenantDirectory"
import { buildPropertyPerformance } from "@/lib/reports/propertyPerformance"
import { buildVacancyAnalysis } from "@/lib/reports/vacancyAnalysis"
import { buildMunicipalCosts } from "@/lib/reports/municipalCosts"
import { buildCpaNoticeSchedule } from "@/lib/reports/cpaNoticeSchedule"
import { buildInspectionSchedule } from "@/lib/reports/inspectionSchedule"
import { buildPopiaConsentAudit } from "@/lib/reports/popiaConsentAudit"
import { buildContractorPerformance } from "@/lib/reports/contractorPerformance"
import { buildMaintenanceSla } from "@/lib/reports/maintenanceSla"
import type { ReportPeriodType, ReportType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const params = req.nextUrl.searchParams
  const reportType = params.get("type") as ReportType
  const orgId = params.get("orgId")
  const periodType = (params.get("periodType") ?? "this_month") as ReportPeriodType
  const propertyIdsStr = params.get("propertyIds")
  const customFrom = params.get("customFrom")
  const customTo = params.get("customTo")

  if (!reportType || !orgId) {
    return Response.json({ error: "Missing type or orgId" }, { status: 400 })
  }

  // Verify user belongs to org
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  // Check tier access
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier ?? "owner"
  const allowed = REPORT_TIER_ACCESS[reportType]
  if (!allowed?.includes(tier)) {
    return Response.json({ error: "Report not available on your plan" }, { status: 403 })
  }

  const { from, to } = resolvePeriod(
    periodType,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  )

  const propertyIds = propertyIdsStr ? propertyIdsStr.split(",").filter(Boolean) : undefined
  const filters = { orgId, from, to, propertyIds }

  const builders: Record<string, (f: typeof filters) => Promise<unknown>> = {
    portfolio_summary:      buildPortfolioSummary,
    occupancy:              buildOccupancyReport,
    income_collection:      buildIncomeCollectionReport,
    arrears_aging:          buildArrearsAgingReport,
    maintenance_costs:      buildMaintenanceCostReport,
    lease_expiry:           buildLeaseExpiryReport,
    rent_roll:              buildRentRoll,
    application_pipeline:   buildApplicationPipeline,
    owner_portfolio:        buildOwnerPortfolio,
    deposit_register:       buildDepositRegister,
    management_fee_summary: buildManagementFeeSummary,
    expense_report:         buildExpenseReport,
    vat_summary:            buildVatSummary,
    trust_reconciliation:   buildTrustReconciliation,
    tenant_payment_history: buildTenantPaymentHistory,
    debit_order_report:     buildDebitOrderReport,
    tenant_directory:       buildTenantDirectory,
    property_performance:   buildPropertyPerformance,
    vacancy_analysis:       buildVacancyAnalysis,
    municipal_costs:        buildMunicipalCosts,
    cpa_notice_schedule:    buildCpaNoticeSchedule,
    inspection_schedule:    buildInspectionSchedule,
    popia_consent_audit:    buildPopiaConsentAudit,
    contractor_performance: buildContractorPerformance,
    maintenance_sla:        buildMaintenanceSla,
  }

  const builder = builders[reportType]
  if (!builder) {
    return Response.json({ error: "Unknown report type" }, { status: 400 })
  }

  const data = await builder(filters)
  return Response.json(data)
}
