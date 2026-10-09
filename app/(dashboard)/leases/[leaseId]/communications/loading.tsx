/**
 * app/(dashboard)/leases/[leaseId]/communications/loading.tsx — the lease communications page's own skeleton
 *
 * Route:  /leases/[leaseId]/communications
 * Notes:  Mirrors page.tsx + DocumentsTab: BackLink → tenant name + subtitle → an action row (2 buttons) → six
 *         filter pills → one list card of six section bands (Lease documents, Emails, SMS, Letters, System, …), each
 *         over a row. The default "All" filter shows every band; per-band row counts are data-dependent, so one row
 *         stands in per band and empty bands (a single italic line) will be shorter.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink } from "@/components/ui/page-skeleton"

export default function LeaseCommunicationsLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-0.5 h-4 w-72" />
      </div>
      <div className="space-y-6">
        <div className="flex gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-32 rounded-[var(--r-button)]" />)}
        </div>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <div className="bg-muted/40 px-4 py-2"><Skeleton className="h-3.5 w-28" /></div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-[var(--r-button)]" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
