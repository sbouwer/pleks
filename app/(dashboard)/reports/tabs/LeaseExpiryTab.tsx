"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { LeaseExpiryData, LeaseExpiryRow, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

function LeaseTable({ rows, label }: { rows: LeaseExpiryRow[]; label: string }) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label} ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2 pr-2">Unit</th>
              <th className="text-left py-2 pr-2">Tenant</th>
              <th className="text-left py-2 pr-2">Expires</th>
              <th className="text-right py-2 px-2">Rent</th>
              <th className="text-left py-2 px-2">Renewal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lease_id} className="border-b border-border/50">
                <td className="py-2 pr-2 text-xs">{r.unit_number}, {r.property_name}</td>
                <td className="py-2 pr-2">{r.tenant_name}</td>
                <td className="py-2 pr-2 text-xs">
                  {r.lease_end ? new Date(r.lease_end).toLocaleDateString("en-ZA") : "M2M"}
                  {r.days_to_expiry != null && <span className="text-muted-foreground ml-1">({r.days_to_expiry}d)</span>}
                </td>
                <td className="text-right py-2 px-2">{formatZAR(r.rent_amount_cents)}</td>
                <td className="py-2 px-2">
                  {r.renewal_status === "notice_sent" ? (
                    <span className="text-xs text-emerald-600">Notice sent</span>
                  ) : (
                    <span className="text-xs text-amber-600">No action</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export function LeaseExpiryTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<LeaseExpiryData>("lease_expiry", orgId, filters)

  return (
    <ReportShell title="Lease Expiry — Next 90 Days" loading={loading} error={error}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Expiring 30d" value={String(data.expiring_30d.length)} variant={data.expiring_30d.length > 0 ? "warning" : "default"} />
            <MetricCard label="Expiring 31-60d" value={String(data.expiring_60d.length)} />
            <MetricCard label="Expiring 61-90d" value={String(data.expiring_90d.length)} />
            <MetricCard label="Action Required" value={String(data.action_required)} variant={data.action_required > 0 ? "danger" : "default"} />
          </div>

          <LeaseTable rows={data.expiring_30d} label="Expiring in 30 days" />
          <LeaseTable rows={data.expiring_60d} label="Expiring in 31-60 days" />
          <LeaseTable rows={data.expiring_90d} label="Expiring in 61-90 days" />

          {data.month_to_month.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Month-to-month ({data.month_to_month.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Consider offering fixed-term renewals.</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-2">Unit</th>
                      <th className="text-left py-2 pr-2">Tenant</th>
                      <th className="text-right py-2">Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.month_to_month.map((r) => (
                      <tr key={r.lease_id} className="border-b border-border/50">
                        <td className="py-2 pr-2 text-xs">{r.unit_number}, {r.property_name}</td>
                        <td className="py-2 pr-2">{r.tenant_name}</td>
                        <td className="text-right py-2">{formatZAR(r.rent_amount_cents)}</td>
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
