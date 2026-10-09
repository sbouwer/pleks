/**
 * app/(dashboard)/settings/templates/loading.tsx — the Templates page's own skeleton
 *
 * Route:  /settings/templates
 * Notes:  Mirrors page.tsx's default Templates tab in a fill layout: a category header (no pill, three facts —
 *         Editable, System notices, Branding — one sub line, no action, three tabs) → the TemplatesManager body, a
 *         268px template rail beside the editor at h-[calc(100vh-13rem)]. The rail/editor split has no primitive, so
 *         it is two blocks composed here.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkDetailHeader } from "@/components/ui/page-skeleton"

export default function TemplatesSettingsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SkDetailHeader pill={false} facts={3} sub={1} actions={0} tabs={3} />
      <div className="grid h-[calc(100vh-13rem)] min-h-[440px] grid-cols-1 gap-4 lg:grid-cols-[268px_minmax(0,1fr)]">
        <Skeleton className="h-full rounded-[var(--r-button)]" />
        <Skeleton className="h-full rounded-[var(--r-button)]" />
      </div>
    </div>
  )
}
