/**
 * app/(dashboard)/hoa/[hoaId]/loading.tsx — the HOA entity page's own skeleton
 *
 * Route:  /hoa/[hoaId]
 * Notes:  Mirrors page.tsx's default Overview tab: BackLink → name + property/type subtitle → 5 stat tiles →
 *         6 underline tabs (shadcn "line" tabs, about 2px shorter than SkUnderlineTabs) → Quick Actions and
 *         Upcoming cards. The optional CSOS line is conditional and not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkCard, SkStatCards, SkUnderlineTabs } from "@/components/ui/page-skeleton"

export default function HoaEntityLoading() {
  return (
    <div className="space-y-6">
      <div>
        <SkBackLink />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-1.5 h-4 w-72" />
      </div>
      <SkStatCards count={5} cols={5} gap={3} className="h-16" />
      <div>
        <SkUnderlineTabs count={6} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkCard rows={3} className="rounded-xl" />
          <SkCard rows={3} className="rounded-xl" />
        </div>
      </div>
    </div>
  )
}
