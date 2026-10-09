/**
 * app/(dashboard)/settings/privacy/retention/loading.tsx — the data retention page's own skeleton
 *
 * Route:  /settings/privacy/retention
 * Notes:  Mirrors page.tsx's legacy max-w-2xl column: title + two-line subtitle → the RetentionDashboard card (title and
 *         intro, then one row per data category with a badge). The category count comes from the retention policy
 *         snapshot; six stand in.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkColumn, SkPageTitle } from "@/components/ui/page-skeleton"

export default function RetentionLoading() {
  return (
    <SkColumn width="2xl" padded>
      <SkPageTitle size="2xl" sub={2} className="" />
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-1.5 px-6 pt-6 pb-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="divide-y divide-border px-6 pb-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </SkColumn>
  )
}
