/**
 * app/(dashboard)/properties/classify/loading.tsx — the classify-imported-properties page's own skeleton
 *
 * Route:  /properties/classify
 * Notes:  Mirrors page.tsx: its OWN max-w-3xl centred column (with its own p-6 on top of main's) → back link, title
 *         and subtitle → a counter over property cards (name + address, "Looks like" select, Confirm / Skip). Up to
 *         200 cards exist; three fit above the fold. With nothing to classify the page paints a sentence instead.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function ClassifyPropertiesLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Skeleton className="mb-3 h-4 w-36" />
        <Skeleton className="mb-1 h-8 w-80" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-8 flex-1 rounded-[var(--r-button)]" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-[var(--r-button)]" />
              <Skeleton className="h-9 w-20 rounded-[var(--r-button)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
