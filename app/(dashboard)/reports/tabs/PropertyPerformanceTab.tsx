"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { PropertyPerformanceData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function PropertyPerformanceTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<PropertyPerformanceData>("property_performance", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "property_performance", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "property_performance", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Property Performance" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Gross" value={formatZAR(data.total_gross_cents)} />
            <MetricCard label="Total Expenses" value={formatZAR(data.total_expenses_cents)} />
            <MetricCard label="Net Income" value={formatZAR(data.total_net_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-right py-2 px-2">Units</th>
                    <th className="text-right py-2 px-2">Occupancy</th>
                    <th className="text-right py-2 px-2">Gross Income</th>
                    <th className="text-right py-2 px-2">Expenses</th>
                    <th className="text-right py-2 px-2">Net Income</th>
                    <th className="text-right py-2">Maintenance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.property_name} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="text-right py-2 px-2 text-xs">{r.units}</td>
                      <td className="text-right py-2 px-2 text-xs">{r.occupancy_rate}%</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.gross_income_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.total_expenses_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.net_income_cents)}</td>
                      <td className="text-right py-2">{formatZAR(r.maintenance_spend_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  )
}
