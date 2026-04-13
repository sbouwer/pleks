"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { VacancyAnalysisData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function VacancyAnalysisTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<VacancyAnalysisData>("vacancy_analysis", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "vacancy_analysis", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "vacancy_analysis", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Vacancy Analysis" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Vacant Units" value={String(data.total_vacant)} />
            <MetricCard label="Avg Days Vacant" value={String(data.average_days_vacant)} />
            <MetricCard label="Est. Lost Income" value={formatZAR(data.total_estimated_lost_cents)} variant="danger" />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-right py-2 px-2">Days Vacant</th>
                    <th className="text-right py-2 px-2">Monthly Rent</th>
                    <th className="text-right py-2">Est. Lost Income</th>
                  </tr>
                </thead>
                <tbody>
                  {data.currently_vacant.map((r) => (
                    <tr key={r.unit_number + r.property_name} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.unit_number}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="text-right py-2 px-2">{r.days_vacant}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.monthly_rent_cents)}</td>
                      <td className="text-right py-2 text-red-600">{formatZAR(r.estimated_lost_cents)}</td>
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
