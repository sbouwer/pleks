"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import type { MaintenanceSlaData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function MaintenanceSlaTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<MaintenanceSlaData>("maintenance_sla", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "maintenance_sla", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "maintenance_sla", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Maintenance SLA" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Emergency" value={`${data.emergency.rate}%`} variant={data.emergency.rate < 100 ? "danger" : "default"} />
            <MetricCard label="Urgent" value={`${data.urgent.rate}%`} variant={data.urgent.rate < 100 ? "danger" : "default"} />
            <MetricCard label="Routine" value={`${data.routine.rate}%`} variant={data.routine.rate < 100 ? "danger" : "default"} />
            <MetricCard label="Overall" value={`${data.overall_compliance_rate}%`} />
          </div>

          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">SLA Summary</p>
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">SLA Level</th>
                    <th className="text-left py-2 pr-2">Target</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-right py-2 px-2">Met</th>
                    <th className="text-right py-2 px-2">Breached</th>
                    <th className="text-right py-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Emergency", target: "4h", sla: data.emergency },
                    { label: "Urgent",    target: "24h", sla: data.urgent },
                    { label: "Routine",   target: "72h", sla: data.routine },
                  ].map(({ label, target, sla }) => (
                    <tr key={label} className="border-b border-border/50">
                      <td className="py-2 pr-2 font-medium">{label}</td>
                      <td className="py-2 pr-2 text-xs">{target}</td>
                      <td className="text-right py-2 px-2">{sla.total}</td>
                      <td className="text-right py-2 px-2 text-emerald-600">{sla.met}</td>
                      <td className="text-right py-2 px-2 text-red-600">{sla.total - sla.met}</td>
                      <td className="text-right py-2">{sla.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">SLA Breaches</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Work Order</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 pr-2">Category</th>
                    <th className="text-left py-2 pr-2">Urgency</th>
                    <th className="text-right py-2 px-2">Target (h)</th>
                    <th className="text-right py-2 px-2">Actual (h)</th>
                    <th className="text-left py-2">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breaches.map((r) => (
                    <tr key={r.work_order_number + r.created_at} className="border-b border-border/50">
                      <td className="py-2 pr-2 text-xs font-mono">{r.work_order_number}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="py-2 pr-2 text-xs">{r.category}</td>
                      <td className="py-2 pr-2 text-xs capitalize">{r.urgency}</td>
                      <td className="text-right py-2 px-2 text-xs">{r.sla_target_hours}</td>
                      <td className="text-right py-2 px-2 text-xs text-red-600">{r.actual_hours}</td>
                      <td className="py-2 text-xs">{r.created_at}</td>
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
