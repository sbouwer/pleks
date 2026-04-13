"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { TenantPaymentHistoryData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function TenantPaymentHistoryTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<TenantPaymentHistoryData>("tenant_payment_history", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "tenant_payment_history", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "tenant_payment_history", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Tenant Payment History" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Invoiced" value={formatZAR(data.total_invoiced_cents)} />
            <MetricCard label="Total Paid" value={formatZAR(data.total_paid_cents)} />
            <MetricCard label="Outstanding" value={formatZAR(data.total_outstanding_cents)} variant={data.total_outstanding_cents > 0 ? "danger" : "default"} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-right py-2 px-2">Invoiced</th>
                    <th className="text-right py-2 px-2">Paid</th>
                    <th className="text-right py-2 px-2">Balance</th>
                    <th className="text-left py-2 px-2">Last Payment</th>
                    <th className="text-right py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.tenant_name + r.unit_number} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.tenant_name}</td>
                      <td className="py-2 pr-2">{r.unit_number}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.total_invoiced_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.total_paid_cents)}</td>
                      <td className={`text-right py-2 px-2 ${r.balance_cents > 0 ? "text-red-600 font-semibold" : ""}`}>{formatZAR(r.balance_cents)}</td>
                      <td className="py-2 px-2 text-xs">{r.last_payment_date ?? "—"}</td>
                      <td className="text-right py-2 text-xs">{r.payment_count}</td>
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
