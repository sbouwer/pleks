/**
 * app/(dashboard)/properties/[id]/units/new/loading.tsx — the new unit form's own skeleton
 *
 * Route:  /properties/[id]/units/new
 * Notes:  Mirrors page.tsx + UnitForm in create mode: BackLink → title + subtitle → 3-tab strip (mb-8) → tab 1 in a
 *         max-w-2xl column (number, type, beds/baths/parking/m² row, Floor, Notes) → the always-shown save bar. The
 *         tab-1 Rooms block is not reserved (its height was not established).
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkField, SkFormSection, SkUnderlineTabs } from "@/components/ui/page-skeleton"

export default function NewUnitLoading() {
  return (
    <div>
      <SkBackLink />
      <div className="mb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <div className="mb-2"><SkUnderlineTabs count={3} /></div>
      <div className="max-w-2xl space-y-6">
        <SkFormSection heading={false} fields={2} />
        <SkFormSection heading={false} fields={4} cols={4} />
        <div className="w-[120px]"><SkField /></div>
        <SkField textarea />
        <SkButtonRow buttons={1} />
      </div>
    </div>
  )
}
