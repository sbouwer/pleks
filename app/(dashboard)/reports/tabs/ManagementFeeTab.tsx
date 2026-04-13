"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { ManagementFeeSummaryData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function ManagementFeeTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<ManagementFeeSummaryData>("management_fee_summary", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "management_fee_summary", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "management_fee_summary", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Management Fee Summary" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Fees" value={formatZAR(data.total_fees_cents)} />
            <MetricCard label="VAT" value={formatZAR(data.total_vat_cents)} />
            <MetricCard label="Gross Total" value={formatZAR(data.total_gross_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 pr-2">Period</th>
                    <th className="text-right py-2 px-2">Fee</th>
                    <th className="text-right py-2 px-2">VAT</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.property_name + r.period} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="py-2 pr-2 text-xs">{r.period}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.fee_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.vat_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.total_cents)}</td>
                      <td className="py-2 text-xs capitalize">{r.status}</td>
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
