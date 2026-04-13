"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { DepositRegisterData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function DepositRegisterTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<DepositRegisterData>("deposit_register", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "deposit_register", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "deposit_register", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Deposit Register" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Deposits Held" value={String(data.count)} />
            <MetricCard label="Total Held" value={formatZAR(data.total_held_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-right py-2 px-2">Amount Held</th>
                    <th className="text-left py-2 px-2">Date Received</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.tenant_name + r.unit_number} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.tenant_name}</td>
                      <td className="py-2 pr-2">{r.unit_number}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.amount_cents)}</td>
                      <td className="py-2 px-2 text-xs">{r.date_received}</td>
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
