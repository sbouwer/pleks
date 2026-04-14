import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolvePeriod, getPeriodLabel } from "@/lib/reports/periods"
import { buildIncomeCollectionReport } from "@/lib/reports/incomeCollection"
import { buildArrearsAgingReport } from "@/lib/reports/arrearsAging"
import { buildMaintenanceCostReport } from "@/lib/reports/maintenanceCosts"
import { buildRentRoll } from "@/lib/reports/rentRoll"
import { buildOccupancyReport } from "@/lib/reports/occupancy"
import { buildOwnerPortfolio } from "@/lib/reports/ownerPortfolio"
import { buildLeaseExpiryReport } from "@/lib/reports/leaseExpiry"
import { buildApplicationPipeline } from "@/lib/reports/applicationPipeline"
import { buildPortfolioSummary } from "@/lib/reports/portfolioSummary"
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
import {
  exportIncomeCollectionCSV,
  exportArrearsAgingCSV,
  exportMaintenanceCostsCSV,
  exportRentRollCSV,
  exportOccupancyCSV,
  exportOwnerPortfolioCSV,
  exportDepositRegisterCSV,
  exportManagementFeeSummaryCSV,
  exportExpenseReportCSV,
  exportVatSummaryCSV,
  exportTrustReconciliationCSV,
  exportTenantPaymentHistoryCSV,
  exportDebitOrderReportCSV,
  exportTenantDirectoryCSV,
  exportPropertyPerformanceCSV,
  exportVacancyAnalysisCSV,
  exportMunicipalCostsCSV,
  exportCpaNoticeScheduleCSV,
  exportInspectionScheduleCSV,
  exportPopiaConsentAuditCSV,
  exportContractorPerformanceCSV,
  exportMaintenanceSlaCSV,
  exportXeroIncome,
  exportXeroExpenses,
} from "@/lib/reports/exportCSV"
import {
  buildRentRollHTML,
  buildArrearsAgingHTML,
  buildIncomeCollectionHTML,
  buildPortfolioSummaryHTML,
  buildOccupancyHTML,
  buildMaintenanceCostHTML,
  buildLeaseExpiryHTML,
  buildApplicationPipelineHTML,
  buildOwnerPortfolioHTML,
  buildDepositRegisterHTML,
  buildManagementFeeSummaryHTML,
  buildExpenseReportHTML,
  buildVatSummaryHTML,
  buildTrustReconciliationHTML,
  buildTenantPaymentHistoryHTML,
  buildDebitOrderReportHTML,
  buildTenantDirectoryHTML,
  buildPropertyPerformanceHTML,
  buildVacancyAnalysisHTML,
  buildMunicipalCostsHTML,
  buildCpaNoticeScheduleHTML,
  buildInspectionScheduleHTML,
  buildPopiaConsentAuditHTML,
  buildContractorPerformanceHTML,
  buildMaintenanceSlaHTML,
} from "@/lib/reports/generatePDF"
import { getReportBranding } from "@/lib/reports/reportBranding"
import type { ReportFilters, ReportPeriodType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"

async function buildCSV(reportType: string, filters: ReportFilters): Promise<string | null> {
  switch (reportType) {
    case "income_collection":      return exportIncomeCollectionCSV(await buildIncomeCollectionReport(filters))
    case "arrears_aging":          return exportArrearsAgingCSV(await buildArrearsAgingReport(filters))
    case "maintenance_costs":      return exportMaintenanceCostsCSV(await buildMaintenanceCostReport(filters))
    case "rent_roll":              return exportRentRollCSV(await buildRentRoll(filters))
    case "occupancy":              return exportOccupancyCSV(await buildOccupancyReport(filters))
    case "owner_portfolio":        return exportOwnerPortfolioCSV(await buildOwnerPortfolio(filters))
    case "deposit_register":       return exportDepositRegisterCSV(await buildDepositRegister(filters))
    case "management_fee_summary": return exportManagementFeeSummaryCSV(await buildManagementFeeSummary(filters))
    case "expense_report":         return exportExpenseReportCSV(await buildExpenseReport(filters))
    case "vat_summary":            return exportVatSummaryCSV(await buildVatSummary(filters))
    case "trust_reconciliation":   return exportTrustReconciliationCSV(await buildTrustReconciliation(filters))
    case "tenant_payment_history": return exportTenantPaymentHistoryCSV(await buildTenantPaymentHistory(filters))
    case "debit_order_report":     return exportDebitOrderReportCSV(await buildDebitOrderReport(filters))
    case "tenant_directory":       return exportTenantDirectoryCSV(await buildTenantDirectory(filters))
    case "property_performance":   return exportPropertyPerformanceCSV(await buildPropertyPerformance(filters))
    case "vacancy_analysis":       return exportVacancyAnalysisCSV(await buildVacancyAnalysis(filters))
    case "municipal_costs":        return exportMunicipalCostsCSV(await buildMunicipalCosts(filters))
    case "cpa_notice_schedule":    return exportCpaNoticeScheduleCSV(await buildCpaNoticeSchedule(filters))
    case "inspection_schedule":    return exportInspectionScheduleCSV(await buildInspectionSchedule(filters))
    case "popia_consent_audit":    return exportPopiaConsentAuditCSV(await buildPopiaConsentAudit(filters))
    case "contractor_performance": return exportContractorPerformanceCSV(await buildContractorPerformance(filters))
    case "maintenance_sla":        return exportMaintenanceSlaCSV(await buildMaintenanceSla(filters))
    default:                       return null
  }
}

async function handleXeroExport(tier: string, xeroType: string | null, filters: ReportFilters): Promise<Response> {
  if (tier !== "firm") return Response.json({ error: "Xero export is Firm tier only" }, { status: 403 })
  if (xeroType === "income") {
    const csv = exportXeroIncome(await buildIncomeCollectionReport(filters))
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"pleks_xero_income.csv\"" } })
  }
  if (xeroType === "expenses") {
    const csv = exportXeroExpenses(await buildMaintenanceCostReport(filters))
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"pleks_xero_expenses.csv\"" } })
  }
  return Response.json({ error: "xeroType must be 'income' or 'expenses'" }, { status: 400 })
}

async function buildPDF(reportType: string, filters: ReportFilters, orgId: string, periodType: ReportPeriodType): Promise<string | null> {
  const orgInfo = await getReportBranding(orgId)
  const pl = getPeriodLabel(periodType, filters.from, filters.to)
  switch (reportType) {
    case "portfolio_summary":      return buildPortfolioSummaryHTML(await buildPortfolioSummary(filters), orgInfo, pl)
    case "rent_roll":              return buildRentRollHTML(await buildRentRoll(filters), orgInfo)
    case "arrears_aging":          return buildArrearsAgingHTML(await buildArrearsAgingReport(filters), orgInfo)
    case "income_collection":      return buildIncomeCollectionHTML(await buildIncomeCollectionReport(filters), orgInfo, pl)
    case "occupancy":              return buildOccupancyHTML(await buildOccupancyReport(filters), orgInfo, pl)
    case "maintenance_costs":      return buildMaintenanceCostHTML(await buildMaintenanceCostReport(filters), orgInfo, pl)
    case "lease_expiry":           return buildLeaseExpiryHTML(await buildLeaseExpiryReport(filters), orgInfo)
    case "application_pipeline":   return buildApplicationPipelineHTML(await buildApplicationPipeline(filters), orgInfo, pl)
    case "owner_portfolio":        return buildOwnerPortfolioHTML(await buildOwnerPortfolio(filters), orgInfo, pl)
    case "deposit_register":       return buildDepositRegisterHTML(await buildDepositRegister(filters), orgInfo)
    case "management_fee_summary": return buildManagementFeeSummaryHTML(await buildManagementFeeSummary(filters), orgInfo, pl)
    case "expense_report":         return buildExpenseReportHTML(await buildExpenseReport(filters), orgInfo, pl)
    case "vat_summary":            return buildVatSummaryHTML(await buildVatSummary(filters), orgInfo, pl)
    case "trust_reconciliation":   return buildTrustReconciliationHTML(await buildTrustReconciliation(filters), orgInfo, pl)
    case "tenant_payment_history": return buildTenantPaymentHistoryHTML(await buildTenantPaymentHistory(filters), orgInfo, pl)
    case "debit_order_report":     return buildDebitOrderReportHTML(await buildDebitOrderReport(filters), orgInfo)
    case "tenant_directory":       return buildTenantDirectoryHTML(await buildTenantDirectory(filters), orgInfo)
    case "property_performance":   return buildPropertyPerformanceHTML(await buildPropertyPerformance(filters), orgInfo, pl)
    case "vacancy_analysis":       return buildVacancyAnalysisHTML(await buildVacancyAnalysis(filters), orgInfo)
    case "municipal_costs":        return buildMunicipalCostsHTML(await buildMunicipalCosts(filters), orgInfo, pl)
    case "cpa_notice_schedule":    return buildCpaNoticeScheduleHTML(await buildCpaNoticeSchedule(filters), orgInfo)
    case "inspection_schedule":    return buildInspectionScheduleHTML(await buildInspectionSchedule(filters), orgInfo)
    case "popia_consent_audit":    return buildPopiaConsentAuditHTML(await buildPopiaConsentAudit(filters), orgInfo)
    case "contractor_performance": return buildContractorPerformanceHTML(await buildContractorPerformance(filters), orgInfo, pl)
    case "maintenance_sla":        return buildMaintenanceSlaHTML(await buildMaintenanceSla(filters), orgInfo, pl)
    default:                       return null
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const params = req.nextUrl.searchParams
  const reportType = params.get("type") ?? ""
  const orgId = params.get("orgId") ?? ""
  const periodType = (params.get("periodType") ?? "this_month") as ReportPeriodType
  const format = params.get("format") ?? "csv"

  if (!reportType || !orgId) {
    return Response.json({ error: "Missing params" }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier ?? "owner"
  const allowed = REPORT_TIER_ACCESS[reportType as keyof typeof REPORT_TIER_ACCESS]
  if (!allowed?.includes(tier)) {
    return Response.json({ error: "Not available on your plan" }, { status: 403 })
  }

  const customFromStr = params.get("customFrom")
  const customToStr = params.get("customTo")
  const customFrom = customFromStr ? new Date(customFromStr) : undefined
  const customTo = customToStr ? new Date(customToStr) : undefined

  let period: { from: Date; to: Date }
  try {
    period = resolvePeriod(periodType, customFrom, customTo)
  } catch {
    return Response.json({ error: "Custom period requires from and to dates" }, { status: 400 })
  }

  const propertyIdsStr = params.get("propertyIds")
  const propertyIds = propertyIdsStr ? propertyIdsStr.split(",").filter(Boolean) : undefined
  const filters = { orgId, from: period.from, to: period.to, propertyIds }

  if (format === "xero") return handleXeroExport(tier, params.get("xeroType"), filters)

  if (format === "csv") {
    const csv = await buildCSV(reportType, filters)
    if (!csv) return Response.json({ error: "CSV export not available for this report" }, { status: 400 })
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${reportType}_export.csv"`,
      },
    })
  }

  if (format === "pdf") {
    const html = await buildPDF(reportType, filters, orgId, periodType)
    if (!html) return Response.json({ error: "PDF export not available for this report" }, { status: 400 })
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  }

  return Response.json({ error: "Unknown format" }, { status: 400 })
}
