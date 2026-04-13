"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { TrustReconciliationData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function TrustReconTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<TrustReconciliationData>("trust_reconciliation", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "trust_reconciliation", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "trust_reconciliation", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Trust Reconciliation" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Opening Balance" value={formatZAR(data.opening_balance_cents)} />
            <MetricCard label="Total Credits" value={formatZAR(data.total_credits_cents)} />
            <MetricCard label="Total Debits" value={formatZAR(data.total_debits_cents)} />
            <MetricCard label="Closing Balance" value={formatZAR(data.closing_balance_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Date</th>
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-left py-2 pr-2">Type</th>
                    <th className="text-right py-2 px-2">Credit</th>
                    <th className="text-right py-2 px-2">Debit</th>
                    <th className="text-left py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.date + r.reference + r.description} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{r.date}</td>
                      <td className="py-2 pr-2">{r.description}</td>
                      <td className="py-2 pr-2 text-xs capitalize">{r.type}</td>
                      <td className="text-right py-2 px-2">{r.credit_cents ? formatZAR(r.credit_cents) : "—"}</td>
                      <td className="text-right py-2 px-2">{r.debit_cents ? formatZAR(r.debit_cents) : "—"}</td>
                      <td className="py-2 text-xs">{r.reference ?? "—"}</td>
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
