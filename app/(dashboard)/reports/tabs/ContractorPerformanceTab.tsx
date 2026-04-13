"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { ContractorPerformanceData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function ContractorPerformanceTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<ContractorPerformanceData>("contractor_performance", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "contractor_performance", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "contractor_performance", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Contractor Performance" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Contractors" value={String(data.total_contractors)} />
            <MetricCard label="Total Spend" value={formatZAR(data.total_spend_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Contractor</th>
                    <th className="text-left py-2 pr-2">Trade</th>
                    <th className="text-right py-2 px-2">Jobs Assigned</th>
                    <th className="text-right py-2 px-2">Jobs Completed</th>
                    <th className="text-right py-2 px-2">Completion %</th>
                    <th className="text-right py-2">Total Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const completionPct = r.jobs_assigned > 0
                      ? (r.jobs_completed / r.jobs_assigned * 100).toFixed(0) + "%"
                      : "—"
                    return (
                      <tr key={r.contractor_name + r.trade} className="border-b border-border/50">
                        <td className="py-2 pr-2">{r.contractor_name}</td>
                        <td className="py-2 pr-2 text-xs">{r.trade}</td>
                        <td className="text-right py-2 px-2">{r.jobs_assigned}</td>
                        <td className="text-right py-2 px-2">{r.jobs_completed}</td>
                        <td className="text-right py-2 px-2 text-xs">{completionPct}</td>
                        <td className="text-right py-2">{formatZAR(r.total_spend_cents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  )
}
