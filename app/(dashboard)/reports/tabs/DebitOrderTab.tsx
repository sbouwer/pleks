"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { DebitOrderReportData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function DebitOrderTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<DebitOrderReportData>("debit_order_report", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "debit_order_report", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "debit_order_report", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Debit Order Report" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Mandates" value={String(data.total_mandates)} />
            <MetricCard label="Active" value={String(data.active_mandates)} />
            <MetricCard label="Total Amount" value={formatZAR(data.total_amount_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-right py-2 px-2">Amount</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Last Collection</th>
                    <th className="text-left py-2">Next Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.tenant_name + r.unit_number} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.tenant_name}</td>
                      <td className="py-2 pr-2">{r.unit_number}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.amount_cents)}</td>
                      <td className="py-2 px-2 text-xs capitalize">{r.status}</td>
                      <td className="py-2 px-2 text-xs">{r.last_collection_date ?? "—"}</td>
                      <td className="py-2 text-xs">{r.next_collection_date ?? "—"}</td>
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
