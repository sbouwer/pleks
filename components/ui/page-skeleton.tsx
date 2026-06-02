/**
 * components/ui/page-skeleton.tsx — loading skeletons that mirror the new page template
 *
 * Notes:  ResourcePageHeaderSkeleton matches ResourcePageHeader exactly — eyebrow → title → bold
 *         headline + description over the dashed rule, with an action on the right — so the loading
 *         state and the loaded page share one silhouette and there's no layout jump. PageSkeleton wraps
 *         it with a list or card content block for the portfolio/operations groups.
 */
import { Skeleton } from "@/components/ui/skeleton"

export function ResourcePageHeaderSkeleton() {
  return (
    <div className="mb-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-2 h-8 w-52" />
      <div className="mt-6 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-[var(--r-button)]" />
      </div>
    </div>
  )
}

export function PageSkeleton({ variant = "list", rows = 6 }: Readonly<{ variant?: "list" | "cards"; rows?: number }>) {
  return (
    <div>
      <ResourcePageHeaderSkeleton />
      {variant === "cards" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[var(--r-button)]" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 rounded-[var(--r-button)]" />)}
        </div>
      )}
    </div>
  )
}
