/**
 * app/(dashboard)/settings/privacy/data-subject-requests/[id]/reject/loading.tsx — the reject form's own skeleton
 *
 * Route:  /settings/privacy/data-subject-requests/[id]/reject
 * Notes:  Mirrors page.tsx's legacy max-w-lg column (a client page that fetches nothing for its first paint): back
 *         button beside the title → the legal-basis card of radio rows → the resolution-notes textarea with its
 *         hint → Cancel / Reject → the footnote. The radio-row count (REJECTION_BASES) was not opened; four stand in.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { SkButtonRow, SkCard, SkColumn, SkField } from "@/components/ui/page-skeleton"

export default function RejectRequestLoading() {
  return (
    <SkColumn width="lg" padded>
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-[var(--r-button)]" />
        <Skeleton className="h-6 w-40" />
      </div>
      <SkCard header="inline" rows={4} className="rounded-xl" />
      <div className="space-y-1.5">
        <SkField textarea />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <SkButtonRow buttons={2} align="left" />
      <Skeleton className="h-8 w-full" />
    </SkColumn>
  )
}
