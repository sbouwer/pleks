/**
 * app/(dashboard)/hoa/(overview)/loading.tsx — the HOA list's own skeleton
 *
 * Route:  /hoa
 * Notes:  Mirrors page.tsx's firm-tier paint: a custom title row with the New HOA Entity link, then a stack of
 *         entity cards (one per HOA; three stand in). Non-firm tiers get an upgrade card instead, which is not
 *         reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function HoaListLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
      </div>
    </div>
  )
}
