/**
 * app/(dashboard)/billing/municipal/[billId]/loading.tsx — the municipal bill page's own skeleton
 *
 * Route:  /billing/municipal/[billId]
 * Notes:  Sits INSIDE billing/layout.tsx. Mirrors page.tsx: BackLink → title + one-line subtitle beside the bill
 *         actions → a two-card grid (Charges, Account Summary) at gap-6. The meter-readings and extraction-notes
 *         cards are conditional and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard } from "@/components/ui/page-skeleton"

export default function MunicipalBillLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-80" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="flex shrink-0 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SkCard rows={5} className="rounded-xl" />
        <SkCard rows={4} className="rounded-xl" />
      </div>
    </div>
  )
}
