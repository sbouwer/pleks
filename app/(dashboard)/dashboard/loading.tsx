/**
 * app/(dashboard)/dashboard/loading.tsx — route skeleton for /dashboard
 *
 * Route:  /dashboard
 * Notes:  Mirrors the populated dashboard silhouette — page header + plan banner + KPI strip + two
 *         widget rows — so the load reads in the same door grammar with no layout jump.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { ResourcePageHeaderSkeleton } from "@/components/ui/page-skeleton"

export default function DashboardLoading() {
  return (
    <div>
      <ResourcePageHeaderSkeleton />
      <Skeleton className="mb-4 h-20 rounded-[var(--r-button)]" />
      <Skeleton className="mb-4 h-24 rounded-[var(--r-button)]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-[var(--r-button)]" />
        <Skeleton className="h-64 rounded-[var(--r-button)]" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-[var(--r-button)]" />
        <Skeleton className="h-48 rounded-[var(--r-button)]" />
      </div>
    </div>
  )
}
