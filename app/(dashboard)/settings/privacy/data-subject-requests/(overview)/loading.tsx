/**
 * app/(dashboard)/settings/privacy/data-subject-requests/(overview)/loading.tsx — the data subject requests list's own skeleton
 *
 * Route:  /settings/privacy/data-subject-requests
 * Notes:  Mirrors page.tsx's legacy max-w-3xl column: title + two-line subtitle → 4 stat tiles → a row of four filter
 *         buttons → one divided card of request rows (up to 50; six stand in). An empty list paints a py-12 card
 *         instead.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkColumn, SkPageTitle, SkStatCards } from "@/components/ui/page-skeleton"

export default function DataSubjectRequestsLoading() {
  return (
    <SkColumn width="3xl" padded>
      <SkPageTitle size="2xl" sub={2} className="" />
      <SkStatCards className="h-[72px]" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-20 rounded-[var(--r-button)]" />)}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </SkColumn>
  )
}
