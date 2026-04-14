"use client"

import { useState, useCallback } from "react"
import { ArrowLeft, Lock, Download } from "lucide-react"
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
import { WelcomePackTab } from "./tabs/WelcomePackTab"
import type { ReportPeriodType, ReportType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS, REPORT_LABELS } from "@/lib/reports/types"

interface Property {
  id: string
  name: string
}

interface Person {
  id: string
  name: string
}

interface ReportsClientProps {
  tier: string
  properties: Property[]
  orgId: string
  landlords: Person[]
  agents: Person[]
}

type FilterState = {
  periodType: ReportPeriodType
  propertyIds: string[]
  customFrom?: string
  customTo?: string
  landlordId?: string
  agentId?: string
  showInactive?: boolean
}

type TabProps = {
  orgId: string
  filters: FilterState
  landlords?: Array<{ id: string; name: string }>
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
  landlord_welcome_pack:  WelcomePackTab,
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
    reports: ["application_pipeline", "owner_portfolio", "landlord_welcome_pack"] as ReportType[],
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
}: Readonly<{
  reportType: ReportType
  tier: string
  orgId: string
  filters: FilterState
  onOpen: (r: ReportType) => void
}>) {
  const hasAccess = REPORT_TIER_ACCESS[reportType]?.includes(tier) ?? false
  const requiredTier = getRequiredTier(reportType)
  const tierIdx = TIER_ORDER.indexOf(tier)
  const requiredIdx = TIER_ORDER.indexOf(requiredTier)
  const isLocked = !hasAccess && requiredIdx > tierIdx

  function buildExportParams(format: string) {
    const p = new URLSearchParams({ type: reportType, orgId, periodType: filters.periodType, format })
    if (filters.periodType === "custom" && filters.customFrom) p.set("customFrom", filters.customFrom)
    if (filters.periodType === "custom" && filters.customTo) p.set("customTo", filters.customTo)
    if (filters.landlordId) p.set("landlordId", filters.landlordId)
    if (filters.agentId) p.set("agentId", filters.agentId)
    return p
  }

  function handleCSV(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(`/api/reports/export?${buildExportParams("csv")}`)
  }

  function handlePDF(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(`/api/reports/export?${buildExportParams("pdf")}`)
  }

  return (
    <div
      className={`relative rounded-lg border bg-card px-3 py-2.5 transition-colors ${
        isLocked ? "opacity-60" : "hover:border-foreground/30 cursor-pointer"
      }`}
      onClick={isLocked ? undefined : () => onOpen(reportType)}
      onKeyDown={isLocked ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") onOpen(reportType) }}
      role={isLocked ? undefined : "button"}
      tabIndex={isLocked ? undefined : 0}
    >
      <div className="flex items-center justify-between gap-1.5">
        <h3 className="text-xs font-semibold truncate min-w-0">{REPORT_LABELS[reportType]}</h3>
        {isLocked ? (
          <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground border rounded px-1 py-0.5">
            <Lock className="h-2 w-2" />
            {TIER_LABELS[requiredTier] ?? requiredTier}
          </span>
        ) : (
          <div className="relative shrink-0 group/dl">
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex items-center text-muted-foreground hover:text-foreground border rounded p-1 transition-colors"
            >
              <Download className="h-3 w-3" />
            </button>
            <div className="absolute right-0 top-full mt-0.5 z-10 hidden group-focus-within/dl:flex flex-col bg-popover border rounded shadow-md text-xs min-w-[72px]">
              <button
                onClick={handleCSV}
                className="px-3 py-1.5 text-left hover:bg-accent transition-colors"
              >
                CSV
              </button>
              <button
                onClick={handlePDF}
                className="px-3 py-1.5 text-left hover:bg-accent transition-colors"
              >
                PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ReportsClient({ tier, properties, orgId, landlords, agents }: Readonly<ReportsClientProps>) {
  const [filters, setFilters] = useState<FilterState>({
    periodType: "this_month",
    propertyIds: [],
    customFrom: undefined,
    customTo: undefined,
    landlordId: undefined,
    agentId: undefined,
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
        <ReportFilters properties={properties} landlords={landlords} agents={agents} tier={tier} onApply={handleApply} />
        <TabComponent orgId={orgId} filters={filters} landlords={landlords} />
      </div>
    )
  }

  return (
    <div>
      <ReportFilters properties={properties} landlords={landlords} agents={agents} tier={tier} onApply={handleApply} />
      <div className="space-y-8">
        {REPORT_CATEGORIES.map((cat) => (
          <section key={cat.name}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {cat.name}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
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
