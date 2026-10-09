/**
 * app/(dashboard)/properties/[id]/scheme/edit/loading.tsx — the managing-scheme form's own skeleton
 *
 * Route:  /properties/[id]/scheme/edit
 * Notes:  Mirrors SchemeEditForm in a max-w-xl column, no cards: BackLink → title → Name, type/cycle pair, CSOS
 *         number, ombud, Notes → Save / Cancel. The "Remove" block shown when editing an existing scheme is not
 *         reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkButtonRow, SkField, SkFormSection } from "@/components/ui/page-skeleton"

export default function SchemeEditLoading() {
  return (
    <div className="max-w-xl">
      <SkBackLink />
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="space-y-6">
        <SkFormSection heading={false} fields={1} />
        <SkFormSection heading={false} fields={2} cols={2} />
        <SkFormSection heading={false} fields={2} />
        <SkField textarea />
        <SkButtonRow buttons={2} align="left" />
      </div>
    </div>
  )
}
