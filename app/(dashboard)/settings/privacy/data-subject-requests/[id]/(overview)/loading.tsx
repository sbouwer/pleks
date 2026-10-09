/**
 * app/(dashboard)/settings/privacy/data-subject-requests/[id]/(overview)/loading.tsx — the request page's own skeleton
 *
 * Route:  /settings/privacy/data-subject-requests/[id]
 * Notes:  Mirrors page.tsx's legacy max-w-2xl column: back button beside the request title and submitted line → the
 *         Subject card → the Status card → the "what this means" box. The carve-out, resolution and "what approval will
 *         strip" cards and the actions row depend on the request type and status and are not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkCard, SkColumn } from "@/components/ui/page-skeleton"

export default function DataSubjectRequestLoading() {
  return (
    <SkColumn width="2xl" padded>
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-[var(--r-button)]" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <SkCard header="inline" rows={2} className="rounded-xl" />
      <SkCard header="inline" rows={2} className="rounded-xl" />
      <Skeleton className="h-[72px] rounded-md" />
    </SkColumn>
  )
}
