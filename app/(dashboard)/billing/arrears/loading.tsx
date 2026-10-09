/**
 * app/(dashboard)/billing/arrears/loading.tsx — the arrears list's own skeleton
 *
 * Route:  /billing/arrears
 * Notes:  Sits INSIDE billing/layout.tsx (h1 + tab bar already drawn). The page has no header of its own:
 *         a 4-tile stat strip (gap-4, mb-6) over a stack of two-line case rows. The row count is unbounded, so
 *         five stand in; an empty org paints an empty state instead, which is not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkStatCards } from "@/components/ui/page-skeleton"

export default function ArrearsListLoading() {
  return (
    <div>
      <SkStatCards gap={4} wrapClassName="mb-6" className="h-[96px]" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}
      </div>
    </div>
  )
}
