/**
 * components/ui/empty-resource-state.tsx — the shared "nothing here yet" page state
 *
 * Notes:  The portfolio empty-state layout from the mockup, reused across Properties / Landlords /
 *         Tenants / Suppliers / Leases: mono eyebrow + page title, a header row (headline + blurb on
 *         the left, a compact add button on the right) over a dashed rule, then a dashed "door" card
 *         with a square icon tile, a reassuring line and a hero add button. The add buttons are passed
 *         in as slots so each page wires its own create flow (modal launcher) while the chrome stays
 *         identical. When a list is empty this REPLACES the filters/among-the-rows chrome — there is
 *         nothing to filter.
 */
import type { ReactNode } from "react"

export function EmptyResourceState({
  eyebrow, title, headline, headerSub, emptyTitle, emptySub, icon, headerAction, heroAction,
}: Readonly<{
  eyebrow:       string
  title:         string
  headline:      string
  headerSub:     string
  emptyTitle:    string
  emptySub:      string
  icon:          ReactNode
  /** compact add button for the header row (right side) */
  headerAction?: ReactNode
  /** hero add button inside the dashed card */
  heroAction?:   ReactNode
}>) {
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-1 font-heading text-3xl font-bold leading-tight text-foreground">{title}</h1>

      {/* header row */}
      <div className="mt-6 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{headline}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{headerSub}</p>
        </div>
        {headerAction}
      </div>

      {/* dashed door card */}
      <div className="mt-4 flex flex-col items-center rounded-[var(--r-button)] border border-dashed border-border bg-card px-6 py-14 text-center">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-muted-foreground">
          {icon}
        </span>
        <p className="font-heading text-base font-semibold text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptySub}</p>
        {heroAction && <div className="mt-5">{heroAction}</div>}
      </div>
    </div>
  )
}
