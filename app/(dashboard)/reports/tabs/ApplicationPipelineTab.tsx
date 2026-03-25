"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { ApplicationPipelineData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function ApplicationPipelineTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<ApplicationPipelineData>("application_pipeline", orgId, filters)

  return (
    <ReportShell title="Application Pipeline" loading={loading} error={error}>
      {data && (
        <>
          {/* Funnel */}
          <Card>
            <CardContent className="pt-4">
              <h3 className="font-heading text-sm mb-4">Conversion Funnel</h3>
              <div className="space-y-2">
                {[
                  { label: "Listing views", value: data.listing_views, pct: null },
                  { label: "Applications started", value: data.applications_started, pct: data.listing_views > 0 ? Math.round((data.applications_started / data.listing_views) * 100) : 0 },
                  { label: "Submitted", value: data.applications_submitted, pct: data.applications_started > 0 ? Math.round((data.applications_submitted / data.applications_started) * 100) : 0 },
                  { label: "Fee paid (R399)", value: data.fee_paid, pct: data.applications_submitted > 0 ? Math.round((data.fee_paid / data.applications_submitted) * 100) : 0 },
                  { label: "Screening complete", value: data.screening_complete, pct: data.fee_paid > 0 ? Math.round((data.screening_complete / data.fee_paid) * 100) : 0 },
                  { label: "Approved", value: data.approved, pct: data.screening_complete > 0 ? Math.round((data.approved / data.screening_complete) * 100) : 0 },
                  { label: "Lease signed", value: data.lease_signed, pct: data.approved > 0 ? Math.round((data.lease_signed / data.approved) * 100) : 0 },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-40 text-sm">{step.label}</div>
                    <div className="flex-1 bg-muted rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-brand h-full rounded-full transition-all"
                        style={{ width: `${data.listing_views > 0 ? Math.max(2, (step.value / data.listing_views) * 100) : 0}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
                        {step.value}
                        {step.pct != null && <span className="text-muted-foreground ml-1">({step.pct}%)</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="Avg days to lease" value={`${data.average_days_to_lease}d`} />
            <MetricCard label="Fee revenue" value={formatZAR(data.revenue_from_fees_cents)} variant="success" />
            <MetricCard label="Approval rate" value={data.screening_complete > 0 ? `${Math.round((data.approved / data.screening_complete) * 100)}%` : "—"} />
          </div>

          {/* FitScore distribution */}
          {data.fitscore_distribution.some((d) => d.count > 0) && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-heading text-sm mb-3">FitScore Distribution</h3>
                <div className="grid grid-cols-4 gap-3">
                  {data.fitscore_distribution.map((d) => (
                    <div key={d.range} className="text-center">
                      <p className="text-xs text-muted-foreground">{d.range}</p>
                      <p className="font-heading text-lg">{d.count}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-listing */}
          {data.listings.length > 0 && (
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <h3 className="font-heading text-sm mb-3">Listing Performance</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-2">Property</th>
                      <th className="text-left py-2 pr-2">Unit</th>
                      <th className="text-right py-2 px-2">Views</th>
                      <th className="text-right py-2 px-2">Applications</th>
                      <th className="text-right py-2">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.listings.map((l) => (
                      <tr key={l.listing_id} className="border-b border-border/50">
                        <td className="py-2 pr-2">{l.property_name}</td>
                        <td className="py-2 pr-2">{l.unit_number}</td>
                        <td className="text-right py-2 px-2">{l.views}</td>
                        <td className="text-right py-2 px-2">{l.applications}</td>
                        <td className="text-right py-2">{l.approved}</td>
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
