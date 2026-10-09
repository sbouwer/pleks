/**
 * app/(dashboard)/properties/[id]/insurance/edit/loading.tsx — the insurance form's own skeleton
 *
 * Route:  /properties/[id]/insurance/edit
 * Notes:  Mirrors InsuranceEditForm in a max-w-xl column: BackLink → title → the "Policy details" section (2-col,
 *         3-col, Excess, Notes) → Save. The broker section sits below the fold and is not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkFormSection } from "@/components/ui/page-skeleton"

export default function InsuranceEditLoading() {
  return (
    <div className="max-w-xl">
      <SkBackLink />
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-3.5 w-28" />
          <SkFormSection heading={false} fields={2} cols={2} />
          <SkFormSection heading={false} fields={3} cols={3} />
          <SkFormSection heading={false} fields={1} textarea />
        </div>
        <SkButtonRow buttons={1} align="left" />
      </div>
    </div>
  )
}
