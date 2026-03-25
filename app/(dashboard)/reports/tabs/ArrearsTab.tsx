"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { ArrearsAgingData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function ArrearsTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<ArrearsAgingData>("arrears_aging", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "arrears_aging", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Arrears Aging" loading={loading} error={error} onExportCSV={handleExportCSV}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Tenants in Arrears" value={String(data.tenants_in_arrears)} variant={data.tenants_in_arrears > 0 ? "danger" : "default"} />
            <MetricCard label="0-30 days" value={formatZAR(data.total_30d_cents)} variant="warning" />
            <MetricCard label="31-60 days" value={formatZAR(data.total_60d_cents)} variant="warning" />
            <MetricCard label="90+ days" value={formatZAR(data.total_90plus_cents)} variant="danger" />
            <MetricCard label="Total" value={formatZAR(data.total_arrears_cents)} variant="danger" />
          </div>

          {data.cases.length > 0 ? (
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-2">Tenant</th>
                      <th className="text-left py-2 pr-2">Unit</th>
                      <th className="text-right py-2 px-2">0-30d</th>
                      <th className="text-right py-2 px-2">31-60d</th>
                      <th className="text-right py-2 px-2">61-90d</th>
                      <th className="text-right py-2 px-2">90d+</th>
                      <th className="text-right py-2 px-2">Total</th>
                      <th className="text-left py-2 px-2">Step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cases.map((c) => (
                      <tr key={c.tenant_id} className="border-b border-border/50">
                        <td className="py-2 pr-2">{c.tenant_name}</td>
                        <td className="py-2 pr-2 text-xs">{c.unit_number}, {c.property_name}</td>
                        <td className="text-right py-2 px-2">{c.arrears_30d_cents ? formatZAR(c.arrears_30d_cents) : "—"}</td>
                        <td className="text-right py-2 px-2">{c.arrears_60d_cents ? formatZAR(c.arrears_60d_cents) : "—"}</td>
                        <td className="text-right py-2 px-2">{c.arrears_90d_cents ? formatZAR(c.arrears_90d_cents) : "—"}</td>
                        <td className="text-right py-2 px-2 text-red-600">{c.arrears_90plus_cents ? formatZAR(c.arrears_90plus_cents) : "—"}</td>
                        <td className="text-right py-2 px-2 font-semibold">{formatZAR(c.total_cents)}</td>
                        <td className="py-2 px-2 text-xs">Step {c.current_step}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">No active arrears cases.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </ReportShell>
  )
}
