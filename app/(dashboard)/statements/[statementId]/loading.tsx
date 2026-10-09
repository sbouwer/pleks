/**
 * app/(dashboard)/statements/[statementId]/loading.tsx — the owner statement page's own skeleton
 *
 * Route:  /statements/[statementId]
 * Notes:  Mirrors page.tsx: BackLink → "Property — Month Year" title + status badge + "Prepared for" line →
 *         4 summary tiles (gap-4, about 72px) → the Rental Income card. The expenses, arrears and notes cards depend
 *         on the statement and are not reserved; income rows are one per unit (five stand in).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard, SkStatCards } from "@/components/ui/page-skeleton"

export default function StatementDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-4 w-64" />
      </div>
      <SkStatCards gap={4} wrapClassName="mb-6" className="h-[72px]" />
      <SkCard rows={5} className="rounded-xl" />
    </div>
  )
}
