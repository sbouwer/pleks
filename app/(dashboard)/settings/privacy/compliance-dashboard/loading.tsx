/**
 * app/(dashboard)/settings/privacy/compliance-dashboard/loading.tsx — the POPIA compliance dashboard's own skeleton
 *
 * Route:  /settings/privacy/compliance-dashboard
 * Notes:  Mirrors page.tsx's legacy max-w-2xl column, fully server-rendered: title + two-line subtitle → health banner
 *         → 4 stat tiles → Retention purge card → the row of link buttons (three or four). The average-resolution line
 *         is conditional and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkCard, SkColumn, SkPageTitle, SkStatCards } from "@/components/ui/page-skeleton"

export default function ComplianceDashboardLoading() {
  return (
    <SkColumn width="2xl" padded>
      <SkPageTitle size="2xl" sub={2} className="" />
      <Skeleton className="h-[60px] rounded-xl" />
      <SkStatCards className="h-[72px]" />
      <SkCard header="inline" rows={3} className="rounded-xl" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-40 rounded-[var(--r-button)]" />)}
      </div>
    </SkColumn>
  )
}
