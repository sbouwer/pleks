/**
 * app/(dashboard)/leases/[leaseId]/LeaseTabSkeleton.tsx — the lease detail page's tab-body skeleton
 *
 * Notes:  One silhouette per tab, shared by the route's loading.tsx (first paint, overview) and the
 *         <Suspense> around the streamed tab body in page.tsx (every tab switch), so the two never drift.
 *         Each mirrors its tab's SSR first paint (.handoff/stream-lease-detail/01-walker.md F2):
 *         overview — KPI strip + three card pairs; finance — actions, summary strip, three card pairs;
 *         communications — actions, filter pills, one full-width list; contacts — actions + one card pair;
 *         details/operations — actions + two card pairs. Shapes come from components/ui/page-skeleton.
 *         loading.tsx cannot read ?tab=, so a cold deep link to another tab first shows the overview
 *         silhouette (walker F3, inherent).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkCard, SkStatCards } from "@/components/ui/page-skeleton"

function SkCardPair({ rows }: Readonly<{ rows: number }>) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SkCard rows={rows} header="inline" />
      <SkCard rows={rows} header="inline" />
    </div>
  )
}

function SkActions({ count = 3 }: Readonly<{ count?: number }>) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-8 w-28" />)}
    </div>
  )
}

export function LeaseTabSkeleton({ tab = "overview" }: Readonly<{ tab?: string }>) {
  switch (tab) {
    case "overview":
      return (
        <div className="space-y-5">
          <SkStatCards className="h-24" />
          <SkCardPair rows={3} />
          <SkCardPair rows={6} />
          <SkCardPair rows={5} />
        </div>
      )
    case "finance":
      return (
        <div className="space-y-6">
          <SkActions />
          <SkStatCards className="h-20" />
          <SkCardPair rows={4} />
          <SkCardPair rows={4} />
          <SkCardPair rows={4} />
        </div>
      )
    case "communications":
      return (
        <div className="space-y-6">
          <SkActions count={2} />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
          </div>
          <SkCard rows={8} header="inline" />
        </div>
      )
    case "contacts":
      return (
        <div className="space-y-4">
          <SkActions />
          <SkCardPair rows={6} />
        </div>
      )
    default:
      return (
        <div className="space-y-5">
          <SkActions />
          <SkCardPair rows={5} />
          <SkCardPair rows={4} />
        </div>
      )
  }
}
