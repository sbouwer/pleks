/**
 * app/(dashboard)/inspections/[inspectionId]/loading.tsx — the inspection page's own skeleton
 *
 * Route:  /inspections/[inspectionId]
 * Notes:  Mirrors page.tsx's desktop view: BackLink → assignee select → title + status badge + unit subtitle beside
 *         the inspection actions → progress card → the first two room cards. Rooms are seeded from templates (often
 *         6–10); two stand in. The dispute-window card, photo comparison and reschedule panel are conditional and not
 *         reserved. Below lg the page swaps to MobileInspectionView; this keeps the desktop shape.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard } from "@/components/ui/page-skeleton"

export default function InspectionDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-4 max-w-xs space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-full rounded-[var(--r-button)]" />
      </div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
        <div className="flex shrink-0 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      </div>
      <Skeleton className="mb-6 h-[76px] rounded-xl" />
      <div className="space-y-4">
        {[0, 1].map((i) => <SkCard key={i} rows={5} className="rounded-xl" />)}
      </div>
    </div>
  )
}
