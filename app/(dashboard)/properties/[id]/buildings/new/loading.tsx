/**
 * app/(dashboard)/properties/[id]/buildings/new/loading.tsx — the new building form's own skeleton
 *
 * Route:  /properties/[id]/buildings/new
 * Notes:  Mirrors BuildingForm (max-w-2xl, space-y-8): BackLink → title → "Building details" (name/code pair, Type,
 *         3-col row, Description) → Maintenance rhythm → Replacement value → Notes → Save / Cancel. The heritage
 *         section needs an existing heritage-type building, so it is never on the create page.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkField, SkFormSection } from "@/components/ui/page-skeleton"

export default function NewBuildingLoading() {
  return (
    <div>
      <SkBackLink />
      <Skeleton className="mb-6 h-8 w-64" />
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
