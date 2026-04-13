"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { MunicipalCostsData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function MunicipalCostsTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<MunicipalCostsData>("municipal_costs", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "municipal_costs", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "municipal_costs", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Municipal Costs" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Water" value={formatZAR(data.total_water_cents)} />
            <MetricCard label="Electricity" value={formatZAR(data.total_electricity_cents)} />
            <MetricCard label="Rates" value={formatZAR(data.total_rates_cents)} />
            <MetricCard label="Total" value={formatZAR(data.total_amount_cents)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 pr-2">Period</th>
                    <th className="text-right py-2 px-2">Water</th>
                    <th className="text-right py-2 px-2">Electricity</th>
                    <th className="text-right py-2 px-2">Rates</th>
                    <th className="text-right py-2 px-2">Refuse</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.property_name + r.period} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="py-2 pr-2 text-xs">{r.period}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.water_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.electricity_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.rates_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.refuse_cents)}</td>
                      <td className="text-right py-2">{formatZAR(r.total_cents)}</td>
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
