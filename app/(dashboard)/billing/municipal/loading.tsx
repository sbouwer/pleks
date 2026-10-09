/**
 * app/(dashboard)/billing/municipal/loading.tsx — the municipal bills list's own skeleton
 *
 * Route:  /billing/municipal
 * Notes:  Sits INSIDE billing/layout.tsx. The page has no header or stats — only a stack of two-line bill rows
 *         (limit 50, so five stand in).
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function MunicipalBillsLoading() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}
    </div>
  )
}
