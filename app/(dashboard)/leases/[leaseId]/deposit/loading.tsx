/**
 * app/(dashboard)/leases/[leaseId]/deposit/loading.tsx — the lease deposit page's own skeleton
 *
 * Route:  /leases/[leaseId]/deposit
 * Notes:  Mirrors page.tsx: BackLink → title + subtitle beside two badges (status, timer) → 4 summary tiles → the
 *         Return Calculation card. The damage/wear/disputed cards, DepositChargesEditor (a client component whose
 *         contents were not read) and interest history depend on the lease and are not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard, SkStatCards } from "@/components/ui/page-skeleton"

export default function LeaseDepositLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
          </div>
          <div className="flex shrink-0 gap-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
          </div>
        </div>
        <SkStatCards gap={4} className="h-[76px]" />
        <SkCard rows={3} className="rounded-xl" />
      </div>
    </div>
  )
}
