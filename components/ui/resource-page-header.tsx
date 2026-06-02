/**
 * components/ui/resource-page-header.tsx — the standard portfolio page header
 *
 * Notes:  The "this is a page" branding shared by Properties / Landlords / Tenants / Suppliers /
 *         Leases: a mono "Portfolio" eyebrow, the page title (with the add button pinned top-right in
 *         the same spot on every page) and an optional sub line, all sitting over the iconic dashed
 *         rule. Page content (tabs, list, cards) renders below the rule. Pairs with EmptyResourceState,
 *         which carries the same eyebrow + dashed-rule grammar for the empty state.
 */
import type { ReactNode } from "react"

export function ResourcePageHeader({
  eyebrow = "Portfolio", title, headline, sub, action,
}: Readonly<{
  eyebrow?:  string
  title:     ReactNode
  /** bold lead line under the title (the "No properties yet" slot) — keep it present on every page */
  headline?: ReactNode
  sub?:      ReactNode
  action?:   ReactNode
}>) {
  // Same rhythm as EmptyResourceState: eyebrow → prominent title → a bold headline + muted description
  // over the dashed rule. Keeps every page (empty or populated) flowing identically.
  return (
    <div className="mb-5">
      {eyebrow && (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      )}
      <h1 className="mt-1 font-heading text-3xl font-bold leading-tight text-foreground">{title}</h1>
      <div className="mt-6 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="min-w-0">
          {headline && <p className="text-sm font-semibold text-foreground">{headline}</p>}
          {sub && <div className="mt-0.5 text-sm text-muted-foreground">{sub}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
