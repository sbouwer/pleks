/**
 * components/ui/page-skeleton.tsx — loading skeletons that mirror the page templates (the skeleton SSOT)
 *
 * Notes:  ResourcePageHeaderSkeleton matches ResourcePageHeader exactly — eyebrow → title → bold
 *         headline + description over the dashed rule, with an action on the right — so the loading
 *         state and the loaded page share one silhouette and there's no layout jump. PageSkeleton wraps
 *         it with a list or card content block for the portfolio/operations groups.
 *         The Sk* primitives are the detail-page vocabulary: each mirrors one shared component's box
 *         (DetailPageHeader, BackLink, the underline tab strip, DetailCard/DetailSection, the detail grid).
 *         A detail segment's loading.tsx composes them into THAT page's own silhouette — the layout lives
 *         beside the page, the shapes live here, so restyling a shared component means editing one primitive.
 */
import type { ReactNode } from "react"
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

/** components/ui/BackLink — the pages with a custom header (property, lease, maintenance). */
export function SkBackLink() {
  return <div className="mb-5"><Skeleton className="h-5 w-24" /></div>
}

/** components/detail/DetailPageHeader — mono back link → h1 + pill → facts over the dashed rule, actions right. */
export function SkDetailHeader({ facts = 4, actions = 3, badge = false }: Readonly<{ facts?: number; actions?: number; badge?: boolean }>) {
  return (
    <div className="-mx-6 -mt-6 mb-5 px-6 pt-6 pb-5">
      <Skeleton className="h-3.5 w-24" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-20 rounded-[var(--r-button)]" />
        {badge && <Skeleton className="h-6 w-24 rounded-[var(--r-button)]" />}
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          {Array.from({ length: facts }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="flex shrink-0 gap-1">
          {Array.from({ length: actions }).map((_, i) => <Skeleton key={i} className="h-9 w-9 rounded-[var(--r-button)]" />)}
        </div>
      </div>
    </div>
  )
}

/** PropertyTabs / LeaseTabs — the underline strip. */
export function SkUnderlineTabs({ count }: Readonly<{ count: number }>) {
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></div>
      ))}
    </div>
  )
}

/** The 2/4-up KPI strip at the top of the property and lease overviews. */
export function SkStatCards({ count = 4, className = "h-[86px]" }: Readonly<{ count?: number; className?: string }>) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={`rounded-[var(--r-button)] ${className}`} />)}
    </div>
  )
}

/**
 * A card: `bar` = DetailCard (titled header bar over a padded body), `inline` = DetailSection (label row inside p-4).
 * `rows` are label/value lines; className sets a min height where the real card pins one.
 */
export function SkCard({ rows = 4, header = "bar", className = "" }: Readonly<{ rows?: number; header?: "bar" | "inline"; className?: string }>) {
  const lines = Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex justify-between gap-4">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-3.5 w-32" />
    </div>
  ))
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-[var(--r-button)] border border-border bg-card ${className}`}>
      {header === "bar" ? (
        <>
          <div className="border-b border-border px-5 py-4"><Skeleton className="h-5 w-36" /></div>
          <div className="flex-1 space-y-3 p-5">{lines}</div>
        </>
      ) : (
        <div className="space-y-3 p-4">
          <Skeleton className="mb-1 h-3.5 w-24" />
          {lines}
        </div>
      )}
    </div>
  )
}

/** DetailPageLayout's body grid; wrap a child in SkFull for DetailFullWidth. */
export function SkDetailGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">{children}</div>
}

export function SkFull({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="md:col-span-2">{children}</div>
}
