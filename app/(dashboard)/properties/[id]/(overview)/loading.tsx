/**
 * app/(dashboard)/properties/[id]/(overview)/loading.tsx — the property detail page's own skeleton
 *
 * Route:  /properties/[id]
 * Notes:  Mirrors page.tsx's desktop header: BackLink → title + type badge + address + agent picker →
 *         5 underline tabs, then the overview tab's silhouette from PropertyTabSkeleton (shared with the
 *         page's Suspense fallback, so the two never drift). Below lg the page swaps to
 *         MobilePropertyView; this keeps the desktop shape.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkUnderlineTabs } from "@/components/ui/page-skeleton"
import { PropertyTabSkeleton } from "../PropertyTabSkeleton"

export default function PropertyDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-16 rounded-[var(--r-button)]" />
        </div>
        <Skeleton className="mt-1 h-4 w-80" />
        <Skeleton className="mt-1 h-7 w-44 rounded-[var(--r-button)]" />
      </div>
      <SkUnderlineTabs count={5} />
      <PropertyTabSkeleton />
    </div>
  )
}
