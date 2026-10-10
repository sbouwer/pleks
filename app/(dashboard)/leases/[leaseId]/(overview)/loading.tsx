/**
 * app/(dashboard)/leases/[leaseId]/(overview)/loading.tsx — the lease detail page's own skeleton
 *
 * Route:  /leases/[leaseId]
 * Notes:  Mirrors page.tsx: BackLink → LeasePageHeader (owner line, tenant title, location, badge row) →
 *         6 underline tabs → the overview tab body. The body is LeaseTabSkeleton, the same component
 *         page.tsx streams the tab behind, so first paint and tab switches show one silhouette.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkUnderlineTabs } from "@/components/ui/page-skeleton"
import { LeaseTabSkeleton } from "../LeaseTabSkeleton"

export default function LeaseDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-1.5 h-7 w-80" />
        <Skeleton className="mt-1.5 h-4 w-60" />
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-20 rounded-full" />)}
        </div>
      </div>
      <SkUnderlineTabs count={6} />
      <LeaseTabSkeleton />
    </div>
  )
}
