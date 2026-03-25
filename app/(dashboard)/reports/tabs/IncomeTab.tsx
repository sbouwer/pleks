"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { IncomeCollectionData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function IncomeTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<IncomeCollectionData>("income_collection", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "income_collection", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Income Collection" loading={loading} error={error} onExportCSV={handleExportCSV}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Expected" value={formatZAR(data.expected_income_cents)} />
            <MetricCard label="Collected" value={formatZAR(data.collected_income_cents)} sub={`(${data.collection_rate}%)`} variant="success" />
            <MetricCard label="Outstanding" value={formatZAR(data.outstanding_cents)} variant={data.outstanding_cents > 0 ? "danger" : "default"} />
            <MetricCard label="DebiCheck" value={formatZAR(data.debicheck_collected_cents)} sub={`(${data.debicheck_count})`} />
          </div>

          {/* Payment method breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">DebiCheck tenants</p>
                <p className="font-heading text-lg">{data.debicheck_count}</p>
                <p className="text-xs text-muted-foreground">{formatZAR(data.debicheck_collected_cents)} collected</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">EFT tenants</p>
                <p className="font-heading text-lg">{data.eft_count}</p>
                <p className="text-xs text-muted-foreground">{formatZAR(data.eft_collected_cents)} collected</p>
              </CardContent>
            </Card>
          </div>

          {/* Invoice table */}
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-right py-2 px-2">Expected</th>
                    <th className="text-right py-2 px-2">Received</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{inv.unit_number}, {inv.property_name}</td>
                      <td className="py-2 pr-2">{inv.tenant_name ?? "VACANT"}</td>
                      <td className="text-right py-2 px-2">{formatZAR(inv.total_amount_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(inv.amount_paid_cents)}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs ${inv.status === "paid" ? "text-emerald-600" : inv.status === "overdue" ? "text-red-600" : "text-amber-600"}`}>
                          {inv.status}
                        </span>
                      </td>
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
