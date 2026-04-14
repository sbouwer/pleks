"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import type { InspectionScheduleData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function InspectionScheduleTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<InspectionScheduleData>("inspection_schedule", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "inspection_schedule", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "inspection_schedule", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Inspection Schedule" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Upcoming" value={String(data.upcoming_count)} />
            <MetricCard label="Overdue" value={String(data.overdue_count)} variant={data.overdue_count > 0 ? "danger" : "default"} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Type</th>
                    <th className="text-left py-2 px-2">Scheduled Date</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2">Days Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const daysOverdueClass = r.days_overdue > 0 ? "text-red-600 font-semibold" : ""
                    return (
                      <tr key={r.unit_number + r.property_name + r.scheduled_date} className="border-b border-border/50">
                        <td className="py-2 pr-2">{r.unit_number}</td>
                        <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                        <td className="py-2 pr-2 text-xs">{r.tenant_name ?? "—"}</td>
                        <td className="py-2 pr-2 text-xs capitalize">{r.type}</td>
                        <td className="py-2 px-2 text-xs">{r.scheduled_date}</td>
                        <td className="py-2 px-2 text-xs capitalize">{r.status}</td>
                        <td className={`text-right py-2 text-xs ${daysOverdueClass}`}>{r.days_overdue > 0 ? r.days_overdue : "—"}</td>
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
