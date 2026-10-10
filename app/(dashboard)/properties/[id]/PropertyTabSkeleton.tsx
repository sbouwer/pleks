/**
 * app/(dashboard)/properties/[id]/PropertyTabSkeleton.tsx — the property detail page's tab-body skeleton
 *
 * Notes:  One silhouette per tab, shared by the route's loading.tsx (first paint, overview) and the
 *         <Suspense> around the streamed tab body in page.tsx (every tab switch), so the two never drift.
 *         Each mirrors its tab's first paint: overview — stat strip, landlord card beside details + map;
 *         units — action bar + unit list; insurance — two columns of cards; scheme — stacked cards;
 *         documents — upload bar, category pills, one list card; operations — actions + two card pairs.
 *         Shapes come from components/ui/page-skeleton. loading.tsx cannot read ?tab=, so a cold deep
 *         link to another tab first shows the overview silhouette (same as the lease page).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkCard, SkRowCards, SkStatCards } from "@/components/ui/page-skeleton"

function SkActions({ count = 2 }: Readonly<{ count?: number }>) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-8 w-28" />)}
    </div>
  )
}

export function PropertyTabSkeleton({ tab = "overview" }: Readonly<{ tab?: string }>) {
  switch (tab) {
    case "units":
      return (
        <div className="space-y-6">
          <SkActions />
          <SkRowCards rows={5} />
        </div>
      )
    case "insurance":
      return (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <SkCard rows={6} />
            <SkCard rows={4} />
          </div>
          <div className="space-y-6">
            <SkCard rows={5} />
            <SkCard rows={3} />
          </div>
        </div>
      )
    case "scheme":
      return (
        <div className="space-y-6">
          <SkCard rows={5} />
          <SkCard rows={3} />
          <SkCard rows={2} />
        </div>
      )
    case "documents":
      return (
        <div className="space-y-4">
          <SkActions count={1} />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
          </div>
          <SkCard rows={6} header="inline" />
        </div>
      )
    case "operations":
      return (
        <div className="space-y-6">
          <SkActions count={2} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkCard rows={3} />
            <SkCard rows={3} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkCard rows={5} />
            <SkCard rows={5} />
          </div>
        </div>
      )
    default:
      return (
        <div className="space-y-6">
          <SkStatCards />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkCard rows={5} />
            <div className="flex flex-col gap-4">
              <SkCard rows={7} />
              <Skeleton className="h-[180px] rounded-[var(--r-button)]" />
            </div>
          </div>
        </div>
      )
  }
}
