/**
 * app/(dashboard)/properties/[id]/financials/loading.tsx — the property financials page's own skeleton
 *
 * Route:  /properties/[id]/financials
 * Notes:  Mirrors page.tsx in a max-w-3xl centred column: back link → title + subtitle → four period pills → one
 *         card holding Income and Expenses blocks (lines over a total) and the Net box. The Deposit card is conditional
 *         on data and not reserved. No tabs and no table.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkColumn, SkPageTitle } from "@/components/ui/page-skeleton"

function Block() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-20" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-border pt-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  )
}

export default function PropertyFinancialsLoading() {
  return (
    <SkColumn width="3xl">
      <div>
        <Skeleton className="mb-2 h-4 w-28" />
        <SkPageTitle size="2xl" sub={1} className="" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
      </div>
      <div className="space-y-5 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-6 w-48" />
        <Block />
        <Block />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    </SkColumn>
  )
}
