/**
 * app/(dashboard)/leases/LeaseListFooter.tsx — lease summary KPI strip (shown above the list)
 *
 * Route:  /leases
 * Auth:   gateway (dashboard layout)
 * Data:   computed from the filtered lease rows passed by LeaseListTabs
 * Notes:  Same connected KPI-strip style as the properties list (shared MetricCard panel).
 */
import { MetricCard as KpiCard } from "@/components/ui/metric-card"
import { formatZARAbbrev } from "@/lib/constants"

interface LeaseListFooterProps {
  totalRent: number
  avgRent: number
  activeCount: number
  totalCount: number
  expiringSoon: number
  cpaNoticesDue: number
}

export function LeaseListFooter({
  totalRent,
  avgRent,
  activeCount,
  totalCount,
  expiringSoon,
  cpaNoticesDue,
}: LeaseListFooterProps) {
  const cpaWord = cpaNoticesDue === 1 ? "notice" : "notices"
  const attention = expiringSoon > 0 || cpaNoticesDue > 0
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary md:grid-cols-4">
      <KpiCard label="Rent roll" value={formatZARAbbrev(totalRent)} subtext="in force" className="border-b border-r border-border md:border-b-0" />
      <KpiCard label="Avg rent" value={formatZARAbbrev(avgRent)} subtext="per lease" className="border-b border-border md:border-b-0 md:border-r" />
      <KpiCard
        label="Leases"
        value={String(activeCount)}
        subtext={`of ${totalCount} total`}
        className="border-r border-border"
      />
      <KpiCard
        label="Expiring"
        value={String(expiringSoon)}
        subtext={`${cpaNoticesDue} CPA ${cpaWord}`}
        subtextVariant={attention ? "warning" : "default"}
        dotColor={attention ? "#EF9F27" : undefined}
      />
    </div>
  )
}
