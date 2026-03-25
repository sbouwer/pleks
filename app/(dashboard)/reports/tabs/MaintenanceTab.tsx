"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { MaintenanceCostData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function MaintenanceTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<MaintenanceCostData>("maintenance_costs", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "maintenance_costs", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Maintenance Costs" loading={loading} error={error} onExportCSV={handleExportCSV}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="Total Jobs" value={String(data.total_jobs)} />
            <MetricCard label="Total Spend" value={formatZAR(data.total_spend_cents)} />
            <MetricCard label="SLA Breaches" value={String(
              data.sla_performance.emergency.total - data.sla_performance.emergency.met +
              data.sla_performance.urgent.total - data.sla_performance.urgent.met +
              data.sla_performance.routine.total - data.sla_performance.routine.met
            )} variant="danger" />
          </div>

          {/* By category */}
          {data.by_category.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-heading text-sm mb-3">By Category</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4">Category</th>
                      <th className="text-right py-2 px-2">Jobs</th>
                      <th className="text-right py-2 px-2">Spend</th>
                      <th className="text-right py-2 px-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_category.map((c) => (
                      <tr key={c.category} className="border-b border-border/50">
                        <td className="py-2 pr-4 capitalize">{c.category}</td>
                        <td className="text-right py-2 px-2">{c.jobs}</td>
                        <td className="text-right py-2 px-2">{formatZAR(c.spend_cents)}</td>
                        <td className="text-right py-2 px-2">{c.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* By property */}
          {data.by_property.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-heading text-sm mb-3">By Property</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4">Property</th>
                      <th className="text-right py-2 px-2">Jobs</th>
                      <th className="text-right py-2 px-2">Spend</th>
                      <th className="text-right py-2 px-2">Per unit/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_property.map((p) => (
                      <tr key={p.property_name} className="border-b border-border/50">
                        <td className="py-2 pr-4">{p.property_name}</td>
                        <td className="text-right py-2 px-2">{p.jobs}</td>
                        <td className="text-right py-2 px-2">{formatZAR(p.spend_cents)}</td>
                        <td className="text-right py-2 px-2">{formatZAR(p.per_unit_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* SLA */}
          <Card>
            <CardContent className="pt-4">
              <h3 className="font-heading text-sm mb-3">SLA Performance</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Emergency (&lt;4h)</p>
                  <p className="font-semibold">{data.sla_performance.emergency.met}/{data.sla_performance.emergency.total} met</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Urgent (&lt;24h)</p>
                  <p className="font-semibold">{data.sla_performance.urgent.met}/{data.sla_performance.urgent.total} met</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Routine (&lt;7d)</p>
                  <p className="font-semibold">{data.sla_performance.routine.met}/{data.sla_performance.routine.total} met</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  )
}
