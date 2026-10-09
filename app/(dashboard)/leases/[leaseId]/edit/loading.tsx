/**
 * app/(dashboard)/leases/[leaseId]/edit/loading.tsx — the draft lease terms form's own skeleton
 *
 * Route:  /leases/[leaseId]/edit
 * Notes:  Mirrors LeaseTermsForm in a max-w-2xl column: BackLink → title + subtitle → the two-column field grid
 *         (nine fields on a default fixed-term draft) → Save / Cancel. The real fields are underline inputs (about
 *         50px) where SkField draws a boxed input (about 36px). The grey explanation paragraphs appear only when a
 *         document exists and are not reserved. A non-draft lease redirects; the inherited lease skeleton flashes first.
 */
import { SkBackLink, SkButtonRow, SkFormSection, SkPageTitle } from "@/components/ui/page-skeleton"

export default function LeaseEditLoading() {
  return (
    <div className="max-w-2xl">
      <SkBackLink />
      <SkPageTitle size="2xl" sub={1} />
      <div className="space-y-6">
        <SkFormSection heading={false} fields={9} cols={2} />
        <SkButtonRow buttons={2} align="left" />
      </div>
    </div>
  )
}
