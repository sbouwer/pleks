/**
 * app/(dashboard)/properties/[id]/loading.tsx — the property detail page's own skeleton
 *
 * Route:  /properties/[id]
 * Notes:  Mirrors page.tsx's desktop overview: BackLink → title + type badge + address + agent picker →
 *         5 underline tabs → 4 stat cards → landlord card beside details + map. Shapes come from
 *         components/ui/page-skeleton; the arrangement is this page's. Below lg the page swaps to
 *         MobilePropertyView; this keeps the desktop shape. Nested pages (edit, units, buildings, …) inherit
 *         this skeleton, which does not fit them, until they get their own loading.tsx.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard, SkStatCards, SkUnderlineTabs } from "@/components/ui/page-skeleton"

export default function PropertyDetailLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-16 rounded-[var(--r-button)]" />
        </div>
        <Skeleton className="mt-1 h-4 w-80" />
        <Skeleton className="mt-1 h-7 w-44 rounded-[var(--r-button)]" />
      </div>
      <SkUnderlineTabs count={5} />
      <div className="space-y-6">
        <SkStatCards />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkCard rows={5} />
          <div className="flex flex-col gap-4">
            <SkCard rows={7} />
            <Skeleton className="h-[180px] rounded-[var(--r-button)]" />
          </div>
        </div>
      </div>
    </div>
  )
}
