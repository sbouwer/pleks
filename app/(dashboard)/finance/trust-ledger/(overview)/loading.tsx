/**
 * app/(dashboard)/finance/trust-ledger/(overview)/loading.tsx — the trust account ledger's own skeleton
 *
 * Route:  /finance/trust-ledger
 * Notes:  The page is client-only and fetches its entries in an effect, so its SSR paint is the header (two
 *         actions), the three filter controls and a ledger card holding a single "Loading…" line. The 8-column
 *         table and the sovereign badge appear only after the effect and are not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { ResourcePageHeaderSkeleton } from "@/components/ui/page-skeleton"

export default function TrustLedgerLoading() {
  return (
    <div className="space-y-6 pb-12">
      <ResourcePageHeaderSkeleton actions={2} />
      <div className="flex flex-wrap items-end gap-3">
        {["w-40", "w-40", "w-48"].map((w, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-8" />
            <Skeleton className={`h-9 ${w} rounded-[var(--r-button)]`} />
          </div>
        ))}
      </div>
      <Skeleton className="h-[70px] rounded-xl" />
    </div>
  )
}
