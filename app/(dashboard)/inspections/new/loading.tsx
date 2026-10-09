/**
 * app/(dashboard)/inspections/new/loading.tsx — the schedule-inspection form's own skeleton
 *
 * Route:  /inspections/new
 * Notes:  Mirrors page.tsx + NewInspectionForm in a max-w-2xl column: BackLink → title → four sections (Property &
 *         tenant; Inspection type — six option tiles; Lease type — two pills; Scheduled date) → the submit button.
 *         The unit field, prefilled-tenant card and profile-gate warning depend on client state and are not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkFormSection } from "@/components/ui/page-skeleton"

export default function NewInspectionLoading() {
  return (
    <div className="max-w-2xl">
      <SkBackLink />
      <Skeleton className="mb-6 h-9 w-64" />
      <div className="space-y-8">
        <SkFormSection fields={2} cols={2} />
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-28" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[58px] rounded-lg" />)}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-24" />
          <div className="flex gap-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-8 w-28 rounded-full" />)}
          </div>
        </div>
        <div className="max-w-xs"><SkFormSection fields={1} /></div>
        <SkButtonRow buttons={1} />
      </div>
    </div>
  )
}
