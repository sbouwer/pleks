/**
 * app/(dashboard)/properties/[id]/units/[unitId]/(overview)/loading.tsx — the unit page's own skeleton
 *
 * Route:  /properties/[id]/units/[unitId]
 * Notes:  Mirrors page.tsx: BackLink → title + status badge + subtitle (mb-2) → the UnitStatusActions button row
 *         (server-painted for every status) → three secondary links → the UnitForm 3-tab strip (mb-8) → tab 1 in a
 *         max-w-2xl column (number, type, beds/baths/parking/m² row, Floor, Notes). The save bar is hidden until
 *         the form is dirty, so none is reserved; neither are the Rooms block or the cards below the fold.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkField, SkFormSection, SkUnderlineTabs } from "@/components/ui/page-skeleton"

export default function UnitDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <div className="flex gap-2">
        {[0, 1].map((i) => <Skeleton key={i} className="h-9 w-40 rounded-[var(--r-button)]" />)}
      </div>
      <div className="mb-6 mt-4 flex gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-32 rounded-[var(--r-button)]" />)}
      </div>
      <div className="mb-2"><SkUnderlineTabs count={3} /></div>
      <div className="max-w-2xl space-y-6">
        <SkFormSection heading={false} fields={2} />
        <SkFormSection heading={false} fields={4} cols={4} />
        <div className="w-[120px]"><SkField /></div>
        <SkField textarea />
      </div>
    </div>
  )
}
