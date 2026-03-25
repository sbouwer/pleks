"use client"

import { useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import type { ReportPeriodType, ReportType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"

interface Property {
  id: string
  name: string
}

interface ReportsClientProps {
  tier: string
  properties: Property[]
  orgId: string
}

export function ReportsClient({ tier, properties, orgId }: ReportsClientProps) {
  const [filters, setFilters] = useState({
    periodType: "this_month" as ReportPeriodType,
    propertyIds: [] as string[],
    customFrom: undefined as string | undefined,
    customTo: undefined as string | undefined,
  })
  const [activeTab, setActiveTab] = useState<string>("portfolio_summary")

  const handleApply = useCallback((f: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }) => {
    setFilters({ ...f, customFrom: f.customFrom, customTo: f.customTo })
  }, [])

  function hasAccess(reportType: ReportType): boolean {
    return REPORT_TIER_ACCESS[reportType]?.includes(tier) ?? false
  }

  const tabs: { value: ReportType; label: string }[] = [
    { value: "portfolio_summary", label: "Portfolio" },
    { value: "occupancy", label: "Occupancy" },
    { value: "income_collection", label: "Income" },
    { value: "arrears_aging", label: "Arrears" },
    { value: "maintenance_costs", label: "Maintenance" },
    { value: "lease_expiry", label: "Leases" },
    { value: "rent_roll", label: "Rent Roll" },
    { value: "application_pipeline", label: "Applications" },
    { value: "owner_portfolio", label: "Owners" },
  ]

  const accessibleTabs = tabs.filter((t) => hasAccess(t.value))

  return (
    <div>
      <ReportFilters properties={properties} onApply={handleApply} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {accessibleTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="portfolio_summary">
          <PortfolioTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="occupancy">
          <OccupancyTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="income_collection">
          <IncomeTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="arrears_aging">
          <ArrearsTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="maintenance_costs">
          <MaintenanceTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="lease_expiry">
          <LeaseExpiryTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="rent_roll">
          <RentRollTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="application_pipeline">
          <ApplicationPipelineTab orgId={orgId} filters={filters} />
        </TabsContent>
        <TabsContent value="owner_portfolio">
          <OwnerPortfolioTab orgId={orgId} filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
