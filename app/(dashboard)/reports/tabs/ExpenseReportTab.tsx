"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { ExpenseReportData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function ExpenseReportTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<ExpenseReportData>("expense_report", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "expense_report", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "expense_report", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Expense Report" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Expenses" value={formatZAR(data.total_amount_cents)} />
          </div>

          {data.by_category && data.by_category.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">By Category</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.by_category.map((cat) => (
                    <MetricCard key={cat.category} label={cat.category} value={formatZAR(cat.amount_cents)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Date</th>
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 pr-2">Category</th>
                    <th className="text-left py-2 pr-2">SARS Code</th>
                    <th className="text-left py-2 pr-2">Supplier</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.date + r.description + r.amount_cents} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{r.date}</td>
                      <td className="py-2 pr-2">{r.description}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="py-2 pr-2 text-xs">{r.category}</td>
                      <td className="py-2 pr-2 text-xs">{r.sars_code ?? "—"}</td>
                      <td className="py-2 pr-2 text-xs">{r.supplier ?? "—"}</td>
                      <td className="text-right py-2">{formatZAR(r.amount_cents)}</td>
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
