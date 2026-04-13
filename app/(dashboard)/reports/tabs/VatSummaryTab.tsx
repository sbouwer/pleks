"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { VatSummaryData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function VatSummaryTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<VatSummaryData>("vat_summary", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "vat_summary", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "vat_summary", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="VAT Summary" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Output VAT" value={formatZAR(data.output_vat_cents)} />
            <MetricCard label="Input VAT" value={formatZAR(data.input_vat_cents)} />
            <MetricCard label="Net VAT" value={formatZAR(data.net_vat_cents)} variant={data.net_vat_cents > 0 ? "warning" : "default"} />
          </div>

          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Output VAT (Management Fees)</p>
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-right py-2 px-2">Net Amount</th>
                    <th className="text-right py-2">VAT Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.output_lines.map((r) => (
                    <tr key={r.description + r.net_cents} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.description}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.net_cents)}</td>
                      <td className="text-right py-2">{formatZAR(r.vat_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Input VAT (Expenses)</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-right py-2 px-2">Net Amount</th>
                    <th className="text-right py-2">VAT Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.input_lines.map((r) => (
                    <tr key={r.description + r.net_cents} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.description}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.net_cents)}</td>
                      <td className="text-right py-2">{formatZAR(r.vat_cents)}</td>
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
