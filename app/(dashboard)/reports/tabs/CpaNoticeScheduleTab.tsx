"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import type { CpaNoticeScheduleData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

function getStatusClass(status: string): string {
  if (status === "overdue") return "text-red-600"
  if (status === "pending") return "text-amber-600"
  if (status === "sent") return "text-emerald-600"
  return ""
}

export function CpaNoticeScheduleTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<CpaNoticeScheduleData>("cpa_notice_schedule", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "cpa_notice_schedule", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "cpa_notice_schedule", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="CPA Notice Schedule" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Overdue" value={String(data.overdue_count)} variant={data.overdue_count > 0 ? "danger" : "default"} />
            <MetricCard label="Due This Week" value={String(data.due_this_week)} variant={data.due_this_week > 0 ? "warning" : "default"} />
            <MetricCard label="Due 30 Days" value={String(data.due_30d)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 px-2">Lease End</th>
                    <th className="text-right py-2 px-2">Days Remaining</th>
                    <th className="text-left py-2 px-2">Notice Due By</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const statusClass = getStatusClass(r.status)
                    return (
                      <tr key={r.tenant_name + r.unit_number} className="border-b border-border/50">
                        <td className="py-2 pr-2">{r.tenant_name}</td>
                        <td className="py-2 pr-2">{r.unit_number}</td>
                        <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                        <td className="py-2 px-2 text-xs">{r.lease_end}</td>
                        <td className="text-right py-2 px-2 text-xs">{r.days_remaining}</td>
                        <td className="py-2 px-2 text-xs">{r.notice_due_by}</td>
                        <td className={`py-2 text-xs capitalize ${statusClass}`}>{r.status}</td>
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
