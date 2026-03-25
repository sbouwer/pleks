"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import type { OccupancyData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function OccupancyTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<OccupancyData>("occupancy", orgId, filters)

  function handleExportCSV() {
    if (!data) return
    const params = new URLSearchParams({ type: "occupancy", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Occupancy Report" loading={loading} error={error} onExportCSV={handleExportCSV}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Units" value={String(data.totals.total_units)} />
            <MetricCard label="Occupied" value={String(data.totals.occupied_units)} sub={`(${data.totals.occupancy_rate}%)`} variant="success" />
            <MetricCard label="Avg Vacancy" value={`${data.average_vacancy_days}d`} variant={data.average_vacancy_days > 30 ? "warning" : "default"} />
            <MetricCard label="Target" value="< 30d" sub="(benchmark)" />
          </div>

          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">Property</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-right py-2 px-2">Occupied</th>
                    <th className="text-right py-2 px-2">Vacant</th>
                    <th className="text-right py-2 px-2">Notice</th>
                    <th className="text-right py-2 px-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.property_id} className="border-b border-border/50">
                      <td className="py-2 pr-4">{r.property_name}</td>
                      <td className="text-right py-2 px-2">{r.total_units}</td>
                      <td className="text-right py-2 px-2">{r.occupied_units}</td>
                      <td className="text-right py-2 px-2">{r.vacant_units}</td>
                      <td className="text-right py-2 px-2">{r.notice_units}</td>
                      <td className="text-right py-2 px-2">{r.occupancy_rate}%</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">TOTAL</td>
                    <td className="text-right py-2 px-2">{data.totals.total_units}</td>
                    <td className="text-right py-2 px-2">{data.totals.occupied_units}</td>
                    <td className="text-right py-2 px-2">{data.totals.vacant_units}</td>
                    <td className="text-right py-2 px-2">{data.totals.notice_units}</td>
                    <td className="text-right py-2 px-2">{data.totals.occupancy_rate}%</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {data.vacancies.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-heading text-sm mb-3">Vacancy Duration</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4">Unit</th>
                      <th className="text-left py-2">Property</th>
                      <th className="text-right py-2">Days vacant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vacancies.map((v) => (
                      <tr key={v.unit_id} className="border-b border-border/50">
                        <td className="py-2 pr-4">{v.unit_number}</td>
                        <td className="py-2">{v.property_name}</td>
                        <td className={`text-right py-2 ${v.days_vacant > 30 ? "text-red-600" : ""}`}>{v.days_vacant}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </ReportShell>
  )
}
