/**
 * app/(dashboard)/billing/invoices/loading.tsx — the supplier invoices list's own skeleton
 *
 * Route:  /billing/invoices
 * Notes:  Sits INSIDE billing/layout.tsx. Mirrors page.tsx: a custom title + "N invoices" line over a stack of
 *         three-line invoice rows (limit 100, so five stand in). The ?contractor= "filtered to" line is
 *         conditional and not reserved. SkRowCards spaces its rows at 12px where the page uses 8px.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkRowCards } from "@/components/ui/page-skeleton"

export default function SupplierInvoicesLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-1 h-4 w-28" />
      </div>
      <SkRowCards rows={5} />
    </div>
  )
}
