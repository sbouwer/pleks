"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { TenantDirectoryData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function TenantDirectoryTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<TenantDirectoryData>("tenant_directory", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "tenant_directory", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "tenant_directory", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="Tenant Directory" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Active Tenants" value={String(data.total_active)} />
          </div>
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Role</th>
                    <th className="text-left py-2 pr-2">Email</th>
                    <th className="text-left py-2 pr-2">Phone</th>
                    <th className="text-left py-2 pr-2">Unit</th>
                    <th className="text-left py-2 pr-2">Property</th>
                    <th className="text-left py-2 px-2">Lease End</th>
                    <th className="text-right py-2">Monthly Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.tenant_name + r.unit_number} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.tenant_name}</td>
                      <td className="py-2 pr-2 text-xs">{r.role}</td>
                      <td className="py-2 pr-2 text-xs">{r.email ?? "—"}</td>
                      <td className="py-2 pr-2 text-xs">{r.phone ?? "—"}</td>
                      <td className="py-2 pr-2">{r.unit_number}</td>
                      <td className="py-2 pr-2 text-xs">{r.property_name}</td>
                      <td className="py-2 px-2 text-xs">{r.lease_end ?? "M2M"}</td>
                      <td className="text-right py-2">{formatZAR(r.monthly_rent_cents)}</td>
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
