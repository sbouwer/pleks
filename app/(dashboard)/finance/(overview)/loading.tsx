/**
 * app/(dashboard)/finance/(overview)/loading.tsx — the Finance overview's own skeleton
 *
 * Route:  /finance
 * Notes:  Mirrors FinanceOverview's paid-tier SSR paint (the owner tier renders a shorter page): header with one
 *         action → cash strip → trust + collections cards → arrears + payouts tables → unmatched transactions.
 *         All of it is server data. Table rows are data-dependent, capped at six. The real cards carry a 45px
 *         header where SkCard's bar is 54px, so the blocks here are plain heights instead.
 *         Lives in the (overview) route group so it wraps ONLY the landing page: at the segment root it also
 *         covered every child segment's async layout.tsx await, flashing this shape on the sub-routes (.handoff/route-skeletons/06-walker.md F1).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { ResourcePageHeaderSkeleton, SkTable } from "@/components/ui/page-skeleton"

export default function FinanceOverviewLoading() {
  return (
    <div>
      <ResourcePageHeaderSkeleton actions={1} />
      <div className="space-y-4">
        <Skeleton className="h-[130px] rounded-[var(--r-button)]" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[260px] rounded-[var(--r-button)]" />
          <Skeleton className="h-[245px] rounded-[var(--r-button)]" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkTable rows={6} cols={5} />
          <SkTable rows={6} cols={4} />
        </div>
        <SkTable rows={6} cols={4} />
      </div>
    </div>
  )
}
