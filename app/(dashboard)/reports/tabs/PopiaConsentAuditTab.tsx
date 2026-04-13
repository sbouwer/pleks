"use client"

import { useReportData } from "./useReportData"
import { ReportShell, MetricCard } from "./ReportShell"
import { Card, CardContent } from "@/components/ui/card"
import type { PopiaConsentAuditData, ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }
}

export function PopiaConsentAuditTab({ orgId, filters }: Readonly<Props>) {
  const { data, loading, error } = useReportData<PopiaConsentAuditData>("popia_consent_audit", orgId, filters)

  function handleExportCSV() {
    const params = new URLSearchParams({ type: "popia_consent_audit", orgId, periodType: filters.periodType, format: "csv" })
    window.open(`/api/reports/export?${params}`)
  }

  function handleExportPDF() {
    const params = new URLSearchParams({ type: "popia_consent_audit", orgId, periodType: filters.periodType, format: "pdf" })
    window.open(`/api/reports/export?${params}`)
  }

  return (
    <ReportShell title="POPIA Consent Audit" loading={loading} error={error} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Records" value={String(data.total_records)} />
          </div>

          {data.by_type && data.by_type.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">By Consent Type</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.by_type.map((t) => (
                    <MetricCard key={t.consent_type} label={t.consent_type} value={String(t.count)} />
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
                    <th className="text-left py-2 pr-2">Tenant</th>
                    <th className="text-left py-2 pr-2">Consent Type</th>
                    <th className="text-left py-2 pr-2">Granted At</th>
                    <th className="text-left py-2">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.tenant_name + r.consent_type + r.granted_at} className="border-b border-border/50">
                      <td className="py-2 pr-2">{r.tenant_name}</td>
                      <td className="py-2 pr-2 text-xs">{r.consent_type}</td>
                      <td className="py-2 pr-2 text-xs">{r.granted_at}</td>
                      <td className="py-2 text-xs">{r.version ?? "—"}</td>
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
