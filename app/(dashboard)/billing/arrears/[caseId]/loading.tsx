/**
 * app/(dashboard)/billing/arrears/[caseId]/loading.tsx — the arrears case page's own skeleton
 *
 * Route:  /billing/arrears/[caseId]
 * Notes:  Sits INSIDE billing/layout.tsx. Mirrors page.tsx: BackLink → title + status badge + subtitle beside
 *         the case actions → 4 summary tiles → Contact card → Actions Timeline card. The interest card, the
 *         payment-arrangement card and the timeline's row count all depend on the case, so none is reserved
 *         beyond a two-row timeline.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard, SkStatCards } from "@/components/ui/page-skeleton"

export default function ArrearsCaseLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="flex shrink-0 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      </div>
      <SkStatCards gap={4} wrapClassName="mb-6" className="h-[96px]" />
      <div className="space-y-6">
        <SkCard rows={2} className="rounded-xl" />
        <SkCard rows={3} className="rounded-xl" />
      </div>
    </div>
  )
}
