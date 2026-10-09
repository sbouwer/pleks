/**
 * app/(dashboard)/properties/[id]/buildings/[buildingId]/edit/loading.tsx — the edit building form's own skeleton
 *
 * Route:  /properties/[id]/buildings/[buildingId]/edit
 * Notes:  Same BuildingForm as the create page (max-w-2xl, space-y-8): BackLink → "Edit building — name" title →
 *         building details, maintenance rhythm, replacement value, notes → Save / Cancel. The amber heritage section
 *         appears only for heritage-type buildings and is not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkField, SkFormSection } from "@/components/ui/page-skeleton"

export default function EditBuildingLoading() {
  return (
    <div>
      <SkBackLink />
      <Skeleton className="mb-6 h-8 w-80" />
      <div className="max-w-2xl space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-3.5 w-32" />
          <SkFormSection heading={false} fields={2} cols={2} />
          <SkFormSection heading={false} fields={1} />
          <SkFormSection heading={false} fields={3} cols={3} />
          <SkField textarea />
        </div>
        <SkFormSection fields={1} />
        <SkFormSection fields={2} cols={2} />
        <SkField textarea />
        <SkButtonRow buttons={2} align="left" />
      </div>
    </div>
  )
}
