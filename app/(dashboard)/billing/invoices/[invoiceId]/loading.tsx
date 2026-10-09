/**
 * app/(dashboard)/billing/invoices/[invoiceId]/loading.tsx — the supplier invoice page's own skeleton
 *
 * Route:  /billing/invoices/[invoiceId]
 * Notes:  Sits INSIDE billing/layout.tsx. Mirrors page.tsx: BackLink → title + status badge beside the invoice
 *         actions → a two-card grid (Invoice Details, Contractor) at gap-6. The optional "Related to…" line is
 *         conditional and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard } from "@/components/ui/page-skeleton"

export default function SupplierInvoiceLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex shrink-0 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SkCard rows={7} className="rounded-xl" />
        <SkCard rows={5} className="rounded-xl" />
      </div>
    </div>
  )
}
