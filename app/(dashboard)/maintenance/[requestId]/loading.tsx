/**
 * app/(dashboard)/maintenance/[requestId]/loading.tsx — the maintenance request page's own skeleton
 *
 * Route:  /maintenance/[requestId]
 * Notes:  Mirrors page.tsx's desktop view: BackLink → title + WO subtitle → assignee → action row → 5-cell
 *         StatusStrip → 8-stage StageRail → four min-h-[260px] cards. The strip and rail exist only on this page,
 *         so their shapes live here; the cards come from components/ui/page-skeleton.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard } from "@/components/ui/page-skeleton"

export default function MaintenanceDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="space-y-4">
        <div>
          <Skeleton className="h-8 w-80" />
          <Skeleton className="mt-1.5 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-64 rounded-[var(--r-button)]" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
          </div>
          <Skeleton className="h-9 w-28 rounded-[var(--r-button)]" />
        </div>
        <div className="flex divide-x divide-border border-y border-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-1.5 px-4 py-3">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="flex items-start border-b border-border px-4 py-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex min-w-[100px] flex-1 items-start">
              <Skeleton className="mr-2 mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1 pb-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <SkCard key={i} rows={5} className="min-h-[260px]" />)}
        </div>
      </div>
    </div>
  )
}
