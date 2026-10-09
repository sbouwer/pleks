/**
 * app/(dashboard)/settings/privacy/my-data/loading.tsx — the My data & privacy page's own skeleton
 *
 * Route:  /settings/privacy/my-data
 * Notes:  Mirrors page.tsx's legacy max-w-2xl column: title + two-line subtitle → one card per controller holding data
 *         about the user (at least the Pleks responsible-party card; two stand in) → the sovereign-data badge → a
 *         two-button grid → the Information Regulator footnote.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkColumn, SkPageTitle } from "@/components/ui/page-skeleton"

export default function MyDataLoading() {
  return (
    <SkColumn width="2xl" padded>
      <SkPageTitle size="2xl" sub={2} className="" />
      <div className="space-y-3">
        {[0, 1].map((i) => <Skeleton key={i} className="h-[108px] rounded-xl" />)}
      </div>
      <Skeleton className="h-[88px] rounded-[var(--r-button)]" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => <Skeleton key={i} className="h-8 rounded-[var(--r-button)]" />)}
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
    </SkColumn>
  )
}
