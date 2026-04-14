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
                  {[...data.rows]
                    .sort((a, b) => {
                      const prop = a.property_name.localeCompare(b.property_name)
                      if (prop !== 0) return prop
                      const unit = a.unit_number.localeCompare(b.unit_number)
                      if (unit !== 0) return unit
                      // Primary before Co-tenant/Prospective
                      if (a.role === "Primary" && b.role !== "Primary") return -1
                      if (a.role !== "Primary" && b.role === "Primary") return 1
                      return 0
                    })
                    .map((r) => {
                      const isCo = r.role !== "Primary"
                      return (
                        <tr key={r.tenant_name + r.unit_number + r.role} className={`border-b border-border/50${isCo ? " bg-muted/30" : ""}`}>
                          <td className={`py-2 pr-2${isCo ? " pl-6 text-muted-foreground text-xs" : ""}`}>
                            {isCo && <span className="mr-1 text-muted-foreground/50">↳</span>}
                            {r.tenant_name}
                          </td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">{r.role}</td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">{r.email ?? "—"}</td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">{r.phone ?? "—"}</td>
                          <td className="py-2 pr-2 text-xs">{isCo ? "" : r.unit_number}</td>
                          <td className="py-2 pr-2 text-xs">{isCo ? "" : r.property_name}</td>
                          <td className="py-2 px-2 text-xs">{isCo ? "" : (r.lease_end ?? "M2M")}</td>
                          <td className="text-right py-2 text-xs">{isCo ? "" : formatZAR(r.monthly_rent_cents)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  )
}
