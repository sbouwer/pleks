/**
 * app/(dashboard)/maintenance/new/loading.tsx — the log-maintenance form's own skeleton
 *
 * Route:  /maintenance/new
 * Notes:  Mirrors page.tsx + LogMaintenanceForm's step 1: BackLink → title + subtitle → three-step indicator →
 *         a two-column grid: the "Where" card (property combobox, Next) beside the 360px preview rail (desktop
 *         only, an empty-state card). The unit/building fields appear only once a property is chosen and are not
 *         reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkField, SkSteps } from "@/components/ui/page-skeleton"

export default function LogMaintenanceLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="mt-1 h-4 w-96 max-w-full" />
      </div>
      <div className="mb-6"><SkSteps count={3} /></div>
      <div className="items-start gap-6 lg:grid lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border bg-card px-5 py-4">
            <Skeleton className="h-3 w-16" />
            <SkField />
          </div>
          <div className="pt-2"><SkButtonRow buttons={1} /></div>
        </div>
        <Skeleton className="hidden h-[110px] rounded-xl lg:block" />
      </div>
    </div>
  )
}
