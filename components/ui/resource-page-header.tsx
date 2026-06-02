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
  /** bold lead line under the title (the "No properties yet" slot). REQUIRED — every page fills it,
   *  so the empty-state and populated headers always carry a headline (the page template). */
  headline:  ReactNode
  sub?:      ReactNode
  action?:   ReactNode
}>) {
  // Same rhythm as EmptyResourceState: eyebrow → prominent title → a bold headline + muted description
  // over the dashed rule. Keeps every page (empty or populated) flowing identically.
  //
  // Sticky: this is the page's nav / quick-back / quick-add space, so it stays pinned while the content
  // below scrolls. The negative margins cancel the dashboard <main> padding (p-6): -mx-6/px-6 bleed it
  // edge to edge, and -mt-6 with a matching -top-6 stick offset pin it FLUSH to the top — without the
  // offset it would pin 24px low (main's pt-6) and its opaque fill would clip the first row below.
  return (
    <div
      className="sticky -top-6 z-30 -mx-6 -mt-6 mb-5 px-6 pt-6 pb-5"
      style={{ background: "color-mix(in oklab, var(--muted) 30%, var(--background))" }}
    >
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
