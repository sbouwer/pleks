/**
 * app/(dashboard)/settings/(overview)/loading.tsx — the settings overview's own skeleton
 *
 * Route:  /settings
 * Notes:  Mirrors the OVERVIEW only: SettingsPageHeader (no back link, no tabs) → the full-width search bar → grouped
 *         card grids (3-up, icon + title + description per card). Which groups exist (Set up / Needs action /
 *         Frequently used) is data-dependent, so two stand in. Every settings sub-route has its own loading.tsx (or
 *         NoSkeleton) so none inherits this shape. Below lg the page swaps to MobileSettingsNav; this keeps the
 *         desktop shape.
 *         Lives in the (overview) route group so it wraps ONLY the landing page: at the segment root it also
 *         covered every child segment's async layout.tsx await, flashing this shape on the sub-routes (.handoff/route-skeletons/06-walker.md F1).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkSettingsHeader } from "@/components/ui/page-skeleton"

export default function SettingsOverviewLoading() {
  return (
    <div>
      <SkSettingsHeader />
      <Skeleton className="h-11 w-full rounded-[var(--r-button)]" />
      <div className="mt-6 space-y-6">
        {[3, 6].map((cards, g) => (
          <div key={g} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-0.5 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-[var(--r-button)]" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
