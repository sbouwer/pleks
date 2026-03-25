"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { PortfolioSummaryData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function PortfolioTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<PortfolioSummaryData>("portfolio_summary", orgId, filters)

  return (
    <ReportShell title="Portfolio Performance" loading={loading} error={error}>
      {data && (
        <>
          {/* Occupancy */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Units" value={String(data.total_units)} />
            <MetricCard label="Occupied" value={String(data.occupied_units)} sub={`(${data.occupancy_rate}%)`} variant="success" />
            <MetricCard label="Vacant" value={String(data.vacant_units)} variant={data.vacant_units > 0 ? "warning" : "default"} />
            <MetricCard label="Notice" value={String(data.notice_units)} />
          </div>

          {/* Income */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Expected Income" value={formatZAR(data.expected_income_cents)} />
            <MetricCard label="Collected" value={formatZAR(data.collected_income_cents)} sub={`(${data.collection_rate}%)`} variant="success" />
            <MetricCard label="Outstanding" value={formatZAR(data.outstanding_cents)} variant={data.outstanding_cents > 0 ? "danger" : "default"} />
            <MetricCard label="Total Arrears" value={formatZAR(data.total_arrears_cents)} variant={data.total_arrears_cents > 0 ? "danger" : "default"} />
          </div>

          {/* Arrears breakdown */}
          {data.total_arrears_cents > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="0-30 days" value={formatZAR(data.arrears_30d_cents)} variant="warning" />
              <MetricCard label="31-60 days" value={formatZAR(data.arrears_60d_cents)} variant="warning" />
              <MetricCard label="60+ days" value={formatZAR(data.arrears_90plus_cents)} variant="danger" />
            </div>
          )}

          {/* Maintenance */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Open Jobs" value={String(data.open_jobs)} />
            <MetricCard label="SLA Breaches" value={String(data.jobs_overdue_sla)} variant={data.jobs_overdue_sla > 0 ? "danger" : "default"} />
            <MetricCard label="Spend (period)" value={formatZAR(data.maintenance_spend_cents)} />
          </div>

          {/* Lease expiry */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Expiring 30d" value={String(data.expiring_30d)} variant={data.expiring_30d > 0 ? "warning" : "default"} />
            <MetricCard label="Expiring 60d" value={String(data.expiring_60d)} />
            <MetricCard label="Expiring 90d" value={String(data.expiring_90d)} />
          </div>

          {/* Per-property table */}
          {data.properties.length > 0 && (
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4">Property</th>
                      <th className="text-right py-2 px-2">Units</th>
                      <th className="text-right py-2 px-2">Occupied</th>
                      <th className="text-right py-2 px-2">Collection</th>
                      <th className="text-right py-2 px-2">Maintenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.properties.map((p) => (
                      <tr key={p.property_id} className="border-b border-border/50">
                        <td className="py-2 pr-4">{p.property_name}</td>
                        <td className="text-right py-2 px-2">{p.total_units}</td>
                        <td className="text-right py-2 px-2">{p.occupied_units} ({p.occupancy_rate}%)</td>
                        <td className="text-right py-2 px-2">{p.collection_rate}%</td>
                        <td className="text-right py-2 px-2">{formatZAR(p.maintenance_spend_cents)}</td>
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
