/**
 * app/(dashboard)/properties/[id]/edit/loading.tsx — the property edit form's own skeleton
 *
 * Route:  /properties/[id]/edit
 * Notes:  Mirrors PropertyEditForm: text link → title + subtitle beside Cancel / Save → a two-column grid
 *         (cards on the left: Property details, Address, Body corporate; 300px sidebar on the right: Landlord,
 *         Managing agent, Units, Notes). The "Property rules" block below the fold loads in an effect and is not
 *         reserved. Managing agent is hidden for the owner tier; it is drawn here. Card field counts are approximate.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkCard, SkFormCard, SkPageTitle } from "@/components/ui/page-skeleton"

export default function PropertyEditLoading() {
  return (
    <div>
      <Skeleton className="mb-3 h-4 w-32" />
      <SkPageTitle size="2xl" sub={1} actions={2} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <SkFormCard fields={2} cols={2} />
          <SkFormCard fields={6} cols={2} />
          <Skeleton className="h-[72px] rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <SkCard header="inline" rows={2} className="rounded-xl" />
          <SkCard header="inline" rows={2} className="rounded-xl" />
          <SkCard header="inline" rows={4} className="rounded-xl" />
          <Skeleton className="min-h-[120px] flex-1 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
