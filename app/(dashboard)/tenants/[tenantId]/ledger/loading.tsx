/**
 * app/(dashboard)/tenants/[tenantId]/ledger/loading.tsx — the tenant ledger's own skeleton
 *
 * Route:  /tenants/[tenantId]/ledger
 * Notes:  Mirrors page.tsx in a max-w-4xl centred column: back link, title and subtitle beside the Statement link and
 *         Print button → 4 summary tiles → the 6-column rent table. The Deposit Activity card paints only when deposit
 *         rows exist and is not reserved; rent rows are data-dependent (eight stand in).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkPageTitle, SkStatCards, SkTable } from "@/components/ui/page-skeleton"

export default function TenantLedgerLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="mb-2 h-4 w-28" />
          <SkPageTitle size="2xl" sub={1} className="" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-9 w-24 rounded-[var(--r-button)]" />
          <Skeleton className="h-9 w-20 rounded-[var(--r-button)]" />
        </div>
      </div>
      <SkStatCards className="h-[72px]" />
      <SkTable rows={8} cols={6} />
    </div>
  )
}
