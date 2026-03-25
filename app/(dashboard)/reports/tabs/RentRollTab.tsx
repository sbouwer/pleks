"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { RentRollData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function RentRollTab({ orgId, filters }: Props) {
  const { data, loading, error } = useReportData<RentRollData>("rent_roll", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "rent_roll", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "rent_roll", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Rent Roll" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Total Units" value={String(data.total_units)} />
            <MetricCard label="Occupied" value={String(data.occupied_units)} sub={`(${data.occupancy_rate}%)`} variant="success" />
            <MetricCard label="Monthly Rent" value={formatZAR(data.total_monthly_rent_cents)} />
            <MetricCard label="Total Arrears" value={formatZAR(data.total_arrears_cents)} variant={data.total_arrears_cents > 0 ? "danger" : "default"} />
            <MetricCard label="Vacant" value={String(data.total_units - data.occupied_units)} variant={data.total_units - data.occupied_units > 0 ? "warning" : "default"} />
          </div>

          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-right py-2 px-2">Rent/mo</th>
                    <th className="text-left py-2 px-2">Dates</th>
                    <th className="text-left py-2 px-2">Method</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2">Arrears</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="py-2 pr-2">{r.unit_number}</td>
                      <td className="py-2 pr-2">{r.tenant_name ?? <span className="text-muted-foreground">VACANT</span>}</td>
                      <td className="text-right py-2 px-2">{r.monthly_rent_cents ? formatZAR(r.monthly_rent_cents) : "—"}</td>
                      <td className="py-2 px-2 text-xs">
                        {r.lease_start
                          ? `${new Date(r.lease_start).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" })}${r.lease_end ? `–${new Date(r.lease_end).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" })}` : " (M2M)"}`
                          : "—"
                        }
                      </td>
                      <td className="py-2 px-2 text-xs capitalize">{r.payment_method || "—"}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs ${
                          r.status === "occupied" ? "text-emerald-600" :
                          r.status === "notice" ? "text-amber-600" :
                          r.status === "vacant" ? "text-red-600" : ""
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className={`text-right py-2 ${r.arrears_cents > 0 ? "text-red-600 font-semibold" : ""}`}>
                        {r.arrears_cents ? formatZAR(r.arrears_cents) : "—"}
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
