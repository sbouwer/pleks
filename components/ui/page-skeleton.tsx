/**
 * components/ui/page-skeleton.tsx — loading skeletons that mirror the page templates (the skeleton SSOT)
 *
 * Notes:  Every export mirrors ONE real component's box, so the loading state and the loaded page share a
 *         silhouette and nothing jumps on swap. A route's loading.tsx composes these into THAT page's own
 *         layout — the arrangement lives beside the page, the shapes live here, so restyling a shared
 *         component means editing one primitive. Rule: mirror the SSR first paint, never the hydrated state —
 *         reserve no space for anything a useEffect or client fetch paints later (walker F1, #384).
 *         Tailwind needs literal class names, so numeric knobs (cols, gap, width) map through lookup tables.
 */
import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/* ── Page headers ─────────────────────────────────────────────────────────────────────────────────── */

/** components/ui/resource-page-header — eyebrow → h1 → (headline + sub | action) over the dashed rule. */
export function ResourcePageHeaderSkeleton({ actions = 1 }: Readonly<{ actions?: number }>) {
  return (
    <div className="-mx-6 -mt-6 mb-5 px-6 pt-6 pb-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-1 h-9 w-52" />
      <div className="mt-6 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex shrink-0 gap-2">
          {range(actions).map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      </div>
    </div>
  )
}

/** components/settings/SettingsPageHeader — eyebrow → h1 + sub over the dashed rule, no back link. */
export function SkSettingsHeader() {
  return (
    <div className="mb-6">
      <Skeleton className="h-3 w-20" />
      <div className="mt-1 border-b border-dashed border-border pb-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
      </div>
    </div>
  )
}

/**
 * components/detail/DetailPageHeader — mono back link → h1 (+ pill, + badge) → dashed-rule row holding the
 * sub line and/or facts on the left, actions on the right → optional DetailTabs at mt-3.
 * Settings category pages are this header with pill={false} facts={0} sub={1}.
 */
export function SkDetailHeader({
  facts = 4, actions = 3, badge = false, pill = true, sub = 0, tabs = 0,
}: Readonly<{ facts?: number; actions?: number; badge?: boolean; pill?: boolean; sub?: number; tabs?: number }>) {
  return (
    <div className="-mx-6 -mt-6 mb-5 px-6 pt-6 pb-5">
      <Skeleton className="h-3.5 w-24" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-64" />
        {pill && <Skeleton className="h-6 w-20 rounded-[var(--r-button)]" />}
        {badge && <Skeleton className="h-6 w-24 rounded-[var(--r-button)]" />}
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="flex min-w-0 flex-col gap-2">
          {range(sub).map((i) => <Skeleton key={i} className={`h-4 ${i === sub - 1 ? "w-72" : "w-[32rem]"} max-w-full`} />)}
          {facts > 0 && (
            <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
              {range(facts).map((i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          )}
        </div>
        {actions > 0 && (
          <div className="flex shrink-0 gap-1">
            {range(actions).map((i) => <Skeleton key={i} className="h-9 w-9 rounded-[var(--r-button)]" />)}
          </div>
        )}
      </div>
      {tabs > 0 && <div className="mt-3"><SkDetailTabs count={tabs} /></div>}
    </div>
  )
}

/** components/ui/BackLink — the pages with a custom header. */
export function SkBackLink() {
  return <div className="mb-5"><Skeleton className="h-5 w-24" /></div>
}

const TITLE_H = { xl: "h-7", "2xl": "h-8", "3xl": "h-9" } as const

/**
 * A hand-rolled page title block: h1 (+ badges) → sub lines, with actions on the right. For the BackLink
 * pages and the legacy un-templated pages; `className` carries the page's own bottom margin.
 */
export function SkPageTitle({
  size = "2xl", sub = 1, badges = 0, actions = 0, className = "mb-6",
}: Readonly<{ size?: keyof typeof TITLE_H; sub?: number; badges?: number; actions?: number; className?: string }>) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Skeleton className={`${TITLE_H[size]} w-64`} />
          {range(badges).map((i) => <Skeleton key={i} className="h-5 w-16 rounded-[var(--r-button)]" />)}
        </div>
        {range(sub).map((i) => <Skeleton key={i} className="mt-1.5 h-4 w-80 max-w-full" />)}
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 gap-2">
          {range(actions).map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
        </div>
      )}
    </div>
  )
}

/* ── Tabs ─────────────────────────────────────────────────────────────────────────────────────────── */

/** PropertyTabs / LeaseTabs — the underline strip below a custom header (owns its mb-6). */
export function SkUnderlineTabs({ count }: Readonly<{ count: number }>) {
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {range(count).map((i) => <div key={i} className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></div>)}
    </div>
  )
}

/** components/detail/DetailTabs — the amber-underline strip inside DetailPageHeader (no outer margin). */
export function SkDetailTabs({ count }: Readonly<{ count: number }>) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {range(count).map((i) => <div key={i} className="px-3 py-1.5"><Skeleton className="h-5 w-20" /></div>)}
    </div>
  )
}

/* ── Layout wrappers ─────────────────────────────────────────────────────────────────────────────── */

/** DetailPageLayout's body grid; wrap a child in SkFull for DetailFullWidth. */
export function SkDetailGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">{children}</div>
}

export function SkFull({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="md:col-span-2">{children}</div>
}

const COLUMN_W = { lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl", "3xl": "max-w-3xl" } as const

/** The narrow centred column of the legacy pages: `mx-auto max-w-* space-y-6`, `padded` adds px-4 py-8. */
export function SkColumn({
  width = "2xl", padded = false, children,
}: Readonly<{ width?: keyof typeof COLUMN_W; padded?: boolean; children: ReactNode }>) {
  return <div className={`mx-auto ${COLUMN_W[width]} space-y-6 ${padded ? "px-4 py-8" : "pb-12"}`}>{children}</div>
}

/* ── Content blocks ──────────────────────────────────────────────────────────────────────────────── */

const STAT_COLS = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" } as const
const GAP = { 3: "gap-3", 4: "gap-4", 6: "gap-6" } as const

/** A 2-up (mobile) / N-up KPI strip. `className` sets each tile's height; `wrapClassName` the strip's margin. */
export function SkStatCards({
  count = 4, cols = 4, gap = 3, className = "h-[86px]", wrapClassName = "",
}: Readonly<{ count?: number; cols?: keyof typeof STAT_COLS; gap?: keyof typeof GAP; className?: string; wrapClassName?: string }>) {
  return (
    <div className={`grid grid-cols-2 ${STAT_COLS[cols]} ${GAP[gap]} ${wrapClassName}`}>
      {range(count).map((i) => <Skeleton key={i} className={`rounded-[var(--r-button)] ${className}`} />)}
    </div>
  )
}

/**
 * A card: `bar` = DetailCard (titled header bar over a padded body), `inline` = DetailSection / a shadcn Card
 * (label row inside the padding). `rows` are label/value lines; className sets a min height where the real
 * card pins one, or `rounded-xl` for the shadcn cards.
 */
export function SkCard({ rows = 4, header = "bar", className = "" }: Readonly<{ rows?: number; header?: "bar" | "inline"; className?: string }>) {
  const lines = range(rows).map((i) => (
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

/** ListToolbar — the h-11 search box with a filter control beside it. `count` adds the "N results" line. */
export function SkListToolbar({ filters = 1, count = true }: Readonly<{ filters?: number; count?: boolean }>) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex gap-2">
        {range(filters).map((i) => <Skeleton key={i} className="h-11 w-36 rounded-[var(--r-button)]" />)}
        <Skeleton className="h-11 flex-1 rounded-[var(--r-button)]" />
      </div>
      {count && <Skeleton className="h-3.5 w-24" />}
    </div>
  )
}

/** A table in a card: header row of `cols` cells over `rows` body rows. */
export function SkTable({ rows = 8, cols = 5, className = "" }: Readonly<{ rows?: number; cols?: number; className?: string }>) {
  return (
    <div className={`overflow-hidden rounded-[var(--r-button)] border border-border bg-card ${className}`}>
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {range(cols).map((i) => <Skeleton key={i} className="h-3 flex-1" />)}
      </div>
      {range(rows).map((r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
          {range(cols).map((i) => <Skeleton key={i} className={`h-4 flex-1 ${i === 0 ? "" : "opacity-70"}`} />)}
        </div>
      ))}
    </div>
  )
}

/** A stack of row cards (billing): 2-3 text lines on the left, amount + badge on the right. */
export function SkRowCards({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div className="space-y-3">
      {range(rows).map((i) => (
        <div key={i} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3.5 w-64" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Forms ───────────────────────────────────────────────────────────────────────────────────────── */

/** One field: label over an h-9 input (`textarea` → a taller box). */
export function SkField({ textarea = false }: Readonly<{ textarea?: boolean }>) {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className={`${textarea ? "h-24" : "h-9"} w-full rounded-[var(--r-button)]`} />
    </div>
  )
}

const FIELD_COLS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" } as const

/** A form section: optional uppercase heading → `fields` fields in a 1–4 col grid (+ a textarea). */
export function SkFormSection({
  fields = 4, cols = 1, heading = true, textarea = false,
}: Readonly<{ fields?: number; cols?: keyof typeof FIELD_COLS; heading?: boolean; textarea?: boolean }>) {
  return (
    <div className="space-y-3">
      {heading && <Skeleton className="h-3.5 w-28" />}
      <div className={`grid grid-cols-1 gap-4 ${FIELD_COLS[cols]}`}>
        {range(fields).map((i) => <SkField key={i} />)}
      </div>
      {textarea && <SkField textarea />}
    </div>
  )
}

/** A titled card holding a form section, as the shadcn form cards are. */
export function SkFormCard(props: Readonly<{ fields?: number; cols?: keyof typeof FIELD_COLS; textarea?: boolean }>) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 pt-5"><Skeleton className="h-5 w-40" /></div>
      <div className="p-5"><SkFormSection heading={false} {...props} /></div>
    </div>
  )
}

/** The submit row under a form: `buttons` buttons, right-aligned unless `align="left"`. */
export function SkButtonRow({ buttons = 2, align = "right" }: Readonly<{ buttons?: number; align?: "left" | "right" }>) {
  return (
    <div className={`flex gap-2 ${align === "right" ? "justify-end" : ""}`}>
      {range(buttons).map((i) => <Skeleton key={i} className="h-9 w-28 rounded-[var(--r-button)]" />)}
    </div>
  )
}

/** A wizard step indicator: `count` numbered dots joined by rules. */
export function SkSteps({ count = 3 }: Readonly<{ count?: number }>) {
  return (
    <div className="flex items-center gap-2">
      {range(count).map((i) => (
        <div key={i} className="flex flex-1 items-center gap-2 last:flex-none">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
          {i < count - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  )
}

/* ── Legacy composite ────────────────────────────────────────────────────────────────────────────── */

/** ResourcePageHeader over a list or card block — the list routes' one-line loading.tsx. */
export function PageSkeleton({ variant = "list", rows = 6 }: Readonly<{ variant?: "list" | "cards"; rows?: number }>) {
  return (
    <div>
      <ResourcePageHeaderSkeleton />
      {variant === "cards" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {range(4).map((i) => <Skeleton key={i} className="h-32 rounded-[var(--r-button)]" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {range(rows).map((i) => <Skeleton key={i} className="h-16 rounded-[var(--r-button)]" />)}
        </div>
      )}
    </div>
  )
}

/** For a route whose first paint is a modal or a redirect: render nothing, so no ancestor's skeleton flashes. */
export function NoSkeleton() {
  return null
}
