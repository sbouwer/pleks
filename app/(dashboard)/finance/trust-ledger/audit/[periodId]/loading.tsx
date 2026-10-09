/**
 * app/(dashboard)/finance/trust-ledger/audit/[periodId]/loading.tsx — the reconciliation audit page's own skeleton
 *
 * Route:  /finance/trust-ledger/audit/[periodId]
 * Notes:  Mirrors page.tsx's narrow centred column: back link → title + subtitle beside the status pill →
 *         sovereign badge → the 4-row balance card (last row is the shaded variance) → sign-off record →
 *         "Audit exports" heading over an empty-state card. The acknowledgement box and outstanding-items card
 *         are conditional and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkColumn } from "@/components/ui/page-skeleton"

export default function TrustAuditLoading() {
  return (
    <SkColumn width="2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Skeleton className="mb-2 h-4 w-28" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-[88px] rounded-[var(--r-button)]" />
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card px-5 py-4">
        <Skeleton className="h-5 w-32" />
        {[0, 1].map((i) => (
          <div key={i} className="flex justify-between gap-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-[96px] rounded-xl" />
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
    </SkColumn>
  )
}
