/**
 * app/(dashboard)/tenants/[tenantId]/edit/loading.tsx — the tenant edit form's own skeleton
 *
 * Route:  /tenants/[tenantId]/edit
 * Notes:  Mirrors TenantEditForm in a max-w-xl column: BackLink → title → individual-tenant fields (names pair, email,
 *         phones pair, employer/occupation pair, Notes) → a full-width Save. The company variant swaps the names row
 *         for three full rows.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkBackLink, SkField, SkFormSection } from "@/components/ui/page-skeleton"

export default function TenantEditLoading() {
  return (
    <div className="max-w-xl">
      <SkBackLink />
      <Skeleton className="mb-6 h-9 w-56" />
      <div className="space-y-4">
        <SkFormSection heading={false} fields={2} cols={2} />
        <SkFormSection heading={false} fields={1} />
        <SkFormSection heading={false} fields={2} cols={2} />
        <SkFormSection heading={false} fields={2} cols={2} />
        <SkField textarea />
        <Skeleton className="h-9 w-full rounded-[var(--r-button)]" />
      </div>
    </div>
  )
}
