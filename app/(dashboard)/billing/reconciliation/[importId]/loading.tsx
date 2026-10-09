/**
 * app/(dashboard)/billing/reconciliation/[importId]/loading.tsx — the statement import page's own skeleton
 *
 * Route:  /billing/reconciliation/[importId]
 * Notes:  Sits INSIDE billing/layout.tsx. Mirrors page.tsx: BackLink → title + period/filename subtitle beside the
 *         recon actions → 4 summary tiles → the Transactions card. Transaction rows are unbounded, so seven stand
 *         in; the balance-check card is conditional and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkStatCards } from "@/components/ui/page-skeleton"

export default function ReconciliationImportLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-72" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="flex shrink-0 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      </div>
      <SkStatCards gap={4} wrapClassName="mb-6" className="h-[96px]" />
      <div className="rounded-xl border border-border bg-card">
        <div className="px-6 py-4"><Skeleton className="h-6 w-32" /></div>
        <div className="space-y-1 px-6 pb-6">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-2 py-2">
              <div className="space-y-1">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
