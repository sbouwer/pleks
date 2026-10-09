/**
 * app/(dashboard)/billing/(overview)/loading.tsx — the Payments page's own skeleton
 *
 * Route:  /billing
 * Notes:  Sits INSIDE billing/layout.tsx, which already draws the "Billing" h1 and the tab bar, so this starts
 *         below them. Mirrors BillingPageClient's desktop SSR paint: title + subtitle + "Updated" line over five
 *         controls, then the batch-entry card. That card paints only "Loading open invoices…" on the server (the
 *         rows are fetched in an effect), so it is one short block — no rows are reserved. Below lg the page swaps to
 *         a mobile bar; this keeps the desktop shape.
 *         Lives in the (overview) route group so it wraps ONLY the landing page: at the segment root it also
 *         covered every child segment's async layout.tsx await, flashing this shape on the sub-routes (.handoff/route-skeletons/06-walker.md F1).
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function BillingPaymentsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-1 h-4 w-56" />
          <Skeleton className="mt-1 h-3.5 w-44" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-9 w-32 rounded-[var(--r-button)]" />
          <Skeleton className="h-9 w-44 rounded-[var(--r-button)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--r-button)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--r-button)]" />
        </div>
      </div>
      <Skeleton className="mb-6 h-[110px] rounded-xl" />
    </div>
  )
}
