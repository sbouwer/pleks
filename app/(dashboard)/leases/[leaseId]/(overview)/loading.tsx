/**
 * app/(dashboard)/leases/[leaseId]/(overview)/loading.tsx — the lease detail page's own skeleton
 *
 * Route:  /leases/[leaseId]
 * Notes:  Mirrors page.tsx's overview: BackLink → LeasePageHeader (owner line, tenant title, location, badge
 *         row) → 6 underline tabs → KPI strip → two contact cards → collection/financials → activity/deadlines.
 *         Shapes come from components/ui/page-skeleton. The nested edit, deposit, communications and
 *         demand-to-vacate pages inherit this skeleton, which does not fit them, until they get their own loading.tsx.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard, SkStatCards, SkUnderlineTabs } from "@/components/ui/page-skeleton"

export default function LeaseDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-1.5 h-7 w-80" />
        <Skeleton className="mt-1.5 h-4 w-60" />
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-20 rounded-full" />)}
        </div>
      </div>
      <SkUnderlineTabs count={6} />
      <div className="space-y-5">
        <SkStatCards className="h-24" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkCard rows={3} header="inline" />
          <SkCard rows={3} header="inline" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkCard rows={6} header="inline" />
          <SkCard rows={6} header="inline" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkCard rows={5} header="inline" />
          <SkCard rows={5} header="inline" />
        </div>
      </div>
    </div>
  )
}
