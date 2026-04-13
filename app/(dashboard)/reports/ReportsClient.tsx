"use client"

import { useState, useCallback } from "react"
import { ArrowLeft, Lock, Download, FileDown } from "lucide-react"
import { ReportFilters } from "./ReportFilters"
import { PortfolioTab } from "./tabs/PortfolioTab"
import { OccupancyTab } from "./tabs/OccupancyTab"
import { IncomeTab } from "./tabs/IncomeTab"
import { ArrearsTab } from "./tabs/ArrearsTab"
import { MaintenanceTab } from "./tabs/MaintenanceTab"
import { LeaseExpiryTab } from "./tabs/LeaseExpiryTab"
import { RentRollTab } from "./tabs/RentRollTab"
import { ApplicationPipelineTab } from "./tabs/ApplicationPipelineTab"
import { OwnerPortfolioTab } from "./tabs/OwnerPortfolioTab"
import { DepositRegisterTab } from "./tabs/DepositRegisterTab"
import { ManagementFeeTab } from "./tabs/ManagementFeeTab"
import { ExpenseReportTab } from "./tabs/ExpenseReportTab"
import { VatSummaryTab } from "./tabs/VatSummaryTab"
import { TrustReconTab } from "./tabs/TrustReconTab"
import { TenantPaymentHistoryTab } from "./tabs/TenantPaymentHistoryTab"
import { DebitOrderTab } from "./tabs/DebitOrderTab"
import { TenantDirectoryTab } from "./tabs/TenantDirectoryTab"
import { PropertyPerformanceTab } from "./tabs/PropertyPerformanceTab"
import { VacancyAnalysisTab } from "./tabs/VacancyAnalysisTab"
import { MunicipalCostsTab } from "./tabs/MunicipalCostsTab"
import { CpaNoticeScheduleTab } from "./tabs/CpaNoticeScheduleTab"
import { InspectionScheduleTab } from "./tabs/InspectionScheduleTab"
import { PopiaConsentAuditTab } from "./tabs/PopiaConsentAuditTab"
import { ContractorPerformanceTab } from "./tabs/ContractorPerformanceTab"
import { MaintenanceSlaTab } from "./tabs/MaintenanceSlaTab"
import type { ReportPeriodType, ReportType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS, REPORT_LABELS, REPORT_DESCRIPTIONS } from "@/lib/reports/types"

interface Property {
  id: string
  name: string
}

interface ReportsClientProps {
  tier: string
  properties: Property[]
  orgId: string
}

type FilterState = {
  periodType: ReportPeriodType
  propertyIds: string[]
  customFrom?: string
  customTo?: string
}

type TabProps = {
  orgId: string
  filters: FilterState
}

// Mapping from ReportType → component — avoids 25-branch switch (SonarJS S3776)
const TAB_COMPONENTS: Record<ReportType, React.ComponentType<TabProps>> = {
  portfolio_summary:      PortfolioTab,
  occupancy:              OccupancyTab,
  income_collection:      IncomeTab,
  arrears_aging:          ArrearsTab,
  maintenance_costs:      MaintenanceTab,
  lease_expiry:           LeaseExpiryTab,
  rent_roll:              RentRollTab,
  application_pipeline:   ApplicationPipelineTab,
  owner_portfolio:        OwnerPortfolioTab,
  annual_tax_summary:     PortfolioTab, // placeholder — not built yet
  deposit_register:       DepositRegisterTab,
  management_fee_summary: ManagementFeeTab,
  expense_report:         ExpenseReportTab,
  vat_summary:            VatSummaryTab,
  trust_reconciliation:   TrustReconTab,
  tenant_payment_history: TenantPaymentHistoryTab,
  debit_order_report:     DebitOrderTab,
  tenant_directory:       TenantDirectoryTab,
  property_performance:   PropertyPerformanceTab,
  vacancy_analysis:       VacancyAnalysisTab,
  municipal_costs:        MunicipalCostsTab,
  cpa_notice_schedule:    CpaNoticeScheduleTab,
  inspection_schedule:    InspectionScheduleTab,
  popia_consent_audit:    PopiaConsentAuditTab,
  contractor_performance: ContractorPerformanceTab,
  maintenance_sla:        MaintenanceSlaTab,
}

const TIER_ORDER = ["owner", "steward", "portfolio", "firm"]
const TIER_LABELS: Record<string, string> = {
  owner: "Owner",
  steward: "Steward",
  portfolio: "Portfolio",
  firm: "Firm",
}

const REPORT_CATEGORIES = [
  {
    name: "Financial",
    reports: [
      "portfolio_summary", "income_collection", "rent_roll",
      "expense_report", "management_fee_summary", "deposit_register",
      "vat_summary", "trust_reconciliation",
    ] as ReportType[],
  },
  {
    name: "Tenant",
    reports: [
      "tenant_directory", "arrears_aging", "tenant_payment_history", "debit_order_report",
    ] as ReportType[],
  },
  {
    name: "Property",
    reports: [
      "property_performance", "occupancy", "vacancy_analysis", "municipal_costs",
    ] as ReportType[],
  },
  {
    name: "Compliance",
    reports: ["cpa_notice_schedule", "inspection_schedule", "popia_consent_audit"] as ReportType[],
  },
  {
    name: "Operations",
    reports: ["maintenance_costs", "contractor_performance", "maintenance_sla", "lease_expiry"] as ReportType[],
  },
  {
    name: "Agency",
    reports: ["application_pipeline", "owner_portfolio"] as ReportType[],
  },
]

function getRequiredTier(reportType: ReportType): string {
  const tiers = REPORT_TIER_ACCESS[reportType] ?? []
  const first = tiers[0]
  return first ?? "firm"
}

function ReportCard({
  reportType,
  tier,
  orgId,
  filters,
  onOpen,
}: {
  reportType: ReportType
  tier: string
  orgId: string
  filters: FilterState
  onOpen: (r: ReportType) => void
}) {
  const hasAccess = REPORT_TIER_ACCESS[reportType]?.includes(tier) ?? false
  const requiredTier = getRequiredTier(reportType)
  const tierIdx = TIER_ORDER.indexOf(tier)
  const requiredIdx = TIER_ORDER.indexOf(requiredTier)
  const isLocked = !hasAccess && requiredIdx > tierIdx

  function handleCSV(e: React.MouseEvent) {
    e.stopPropagation()
    const p = new URLSearchParams({ type: reportType, orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${p}`)
  }

  function handlePDF(e: React.MouseEvent) {
    e.stopPropagation()
    const p = new URLSearchParams({ type: reportType, orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${p}`)
  }

  return (
    <div
      className={`relative rounded-xl border bg-card p-4 flex flex-col gap-2 transition-colors ${
        isLocked ? "opacity-60" : "hover:border-foreground/30 cursor-pointer"
      }`}
      onClick={isLocked ? undefined : () => onOpen(reportType)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight">{REPORT_LABELS[reportType]}</h3>
        {isLocked && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-muted-foreground border rounded px-1.5 py-0.5">
            <Lock className="h-2.5 w-2.5" />
            {TIER_LABELS[requiredTier] ?? requiredTier}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
        {REPORT_DESCRIPTIONS[reportType]}
      </p>
      {!isLocked && (
        <div className="flex gap-1.5 mt-1">
          <button
            onClick={handleCSV}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border rounded px-2 py-1 transition-colors"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={handlePDF}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border rounded px-2 py-1 transition-colors"
          >
            <FileDown className="h-3 w-3" /> PDF
          </button>
        </div>
      )}
    </div>
  )
}

export function ReportsClient({ tier, properties, orgId }: ReportsClientProps) {
  const [filters, setFilters] = useState<FilterState>({
    periodType: "this_month",
    propertyIds: [],
    customFrom: undefined,
    customTo: undefined,
  })
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null)

  const handleApply = useCallback((f: FilterState) => {
    setFilters(f)
  }, [])

  const handleOpen = useCallback((r: ReportType) => {
    setSelectedReport(r)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedReport(null)
  }, [])

  if (selectedReport) {
    const TabComponent = TAB_COMPONENTS[selectedReport]
    return (
      <div>
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All reports
        </button>
        <ReportFilters properties={properties} onApply={handleApply} />
        <TabComponent orgId={orgId} filters={filters} />
      </div>
    )
  }

  return (
    <div>
      <ReportFilters properties={properties} onApply={handleApply} />
      <div className="space-y-8">
        {REPORT_CATEGORIES.map((cat) => (
          <section key={cat.name}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {cat.name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {cat.reports.map((r) => (
                <ReportCard
                  key={r}
                  reportType={r}
                  tier={tier}
                  orgId={orgId}
                  filters={filters}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
