"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { OwnerPortfolioData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function OwnerPortfolioTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<OwnerPortfolioData>("owner_portfolio", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "owner_portfolio", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Owner Portfolio Summary" loading={loading} error={error} onExportCSV={handleExportCSV}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Income" value={formatZAR(data.total_income_cents)} />
            <MetricCard label="Total Expenses" value={formatZAR(data.total_expenses_cents)} />
            <MetricCard label="Net to Owners" value={formatZAR(data.total_net_cents)} variant="success" />
            <MetricCard label="Mgmt Fee Income" value={formatZAR(data.management_fee_income_cents)} variant="success" />
          </div>

          {data.owners.length > 0 && (
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-2">Owner</th>
                      <th className="text-left py-2 pr-2">Property</th>
                      <th className="text-right py-2 px-2">Units</th>
                      <th className="text-right py-2 px-2">Income</th>
                      <th className="text-right py-2 px-2">Expenses</th>
                      <th className="text-right py-2 px-2">Net</th>
                      <th className="text-right py-2">Deposits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.owners.map((o, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 pr-2">{o.owner_name}</td>
                        <td className="py-2 pr-2">{o.property_name}</td>
                        <td className="text-right py-2 px-2">{o.units}</td>
                        <td className="text-right py-2 px-2">{formatZAR(o.gross_income_cents)}</td>
                        <td className="text-right py-2 px-2">{formatZAR(o.expenses_cents)}</td>
                        <td className="text-right py-2 px-2 font-semibold">{formatZAR(o.net_to_owner_cents)}</td>
                        <td className="text-right py-2">{formatZAR(o.deposits_held_cents)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-2">TOTAL</td>
                      <td className="py-2 pr-2" />
                      <td className="text-right py-2 px-2" />
                      <td className="text-right py-2 px-2">{formatZAR(data.total_income_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(data.total_expenses_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(data.total_net_cents)}</td>
                      <td className="text-right py-2">{formatZAR(data.total_deposits_cents)}</td>
                    </tr>
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
