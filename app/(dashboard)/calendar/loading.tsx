/**
 * app/(dashboard)/calendar/loading.tsx — the calendar page's own skeleton
 *
 * Route:  /calendar
 * Notes:  CalendarClient is loaded with ssr:false, so the server paints nothing for the calendar and this is the
 *         only thing on screen until hydration. It mirrors the hydrated shape (no fetch gates it): header with two
 *         actions → h-11 toolbar (view tabs, type filter, search) → the calendar box filling the remaining height
 *         → the colour legend. The fill-height box has no primitive, so it is a min-height block here.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { ResourcePageHeaderSkeleton } from "@/components/ui/page-skeleton"

export default function CalendarLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeaderSkeleton actions={2} />
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex gap-2">
          <Skeleton className="h-11 w-52 rounded-[var(--r-button)]" />
          <Skeleton className="h-11 w-36 rounded-[var(--r-button)]" />
          <Skeleton className="h-11 flex-1 rounded-[var(--r-button)]" />
        </div>
        <Skeleton className="min-h-[420px] flex-1 rounded-[var(--r-button)]" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
    </div>
  )
}
