/**
 * app/(dashboard)/leases/[leaseId]/demand-to-vacate/loading.tsx — the demand-to-vacate picker's own skeleton
 *
 * Route:  /leases/[leaseId]/demand-to-vacate
 * Notes:  Mirrors DemandToVacatePicker: no back link and no page header — the picker draws its own small title +
 *         subtitle inside a max-w-2xl column, over three stacked bordered option buttons (label + blurb). Nothing
 *         else paints until a click.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function DemandToVacateLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <div>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[62px] rounded-[var(--r-button)]" />)}
      </div>
    </div>
  )
}
