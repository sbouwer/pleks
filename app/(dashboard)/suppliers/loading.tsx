/**
 * app/(dashboard)/suppliers/loading.tsx — route skeleton for /suppliers
 *
 * Route:  /suppliers
 * Notes:  Mirrors the page template (ResourcePageHeader + tab row + list) so there's no layout jump.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { ResourcePageHeaderSkeleton } from "@/components/ui/page-skeleton"

export default function SuppliersLoading() {
  return (
    <div>
      <ResourcePageHeaderSkeleton />
      <div className="mb-6 flex gap-1 border-b border-border">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="mb-px h-8 w-28" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-[var(--r-button)]" />)}
      </div>
    </div>
  )
}
