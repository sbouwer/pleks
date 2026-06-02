/**
 * app/(dashboard)/leases/loading.tsx — route skeleton for /leases
 *
 * Route:  /leases
 * Notes:  Mirrors the page template (ResourcePageHeader + tabs + list) so there's no layout jump.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { ResourcePageHeaderSkeleton } from "@/components/ui/page-skeleton"

export default function LeasesLoading() {
  return (
    <div>
      <ResourcePageHeaderSkeleton />
      <div className="mb-4 flex gap-2 border-b border-border pb-0">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`tab-${i}`} className="h-8 w-24" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={`row-${i}`} className="h-14 rounded-[var(--r-button)]" />)}
      </div>
    </div>
  )
}
