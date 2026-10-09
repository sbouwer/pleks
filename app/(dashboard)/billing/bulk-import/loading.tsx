/**
 * app/(dashboard)/billing/bulk-import/loading.tsx — the bulk invoice import page's own skeleton
 *
 * Route:  /billing/bulk-import
 * Notes:  Sits INSIDE billing/layout.tsx. The page is client-only with no fetch, so its first paint is the loaded
 *         "input" step: back link → title + subtitle → one card holding the CSV-format block, a 10-row textarea
 *         with its counter, and a full-width button, all in a narrow centred column.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkColumn, SkPageTitle } from "@/components/ui/page-skeleton"

export default function BulkImportLoading() {
  return (
    <SkColumn width="2xl">
      <div>
        <SkBackLink />
        <SkPageTitle size="2xl" sub={1} className="" />
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
          <Skeleton className="h-[72px] w-full rounded-[var(--r-button)]" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-[220px] w-full rounded-[var(--r-button)]" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-9 w-full rounded-[var(--r-button)]" />
      </div>
    </SkColumn>
  )
}
