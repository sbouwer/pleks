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
  eyebrow = "Portfolio", title, sub, action,
}: Readonly<{
  eyebrow?: string
  title:    string
  sub?:     ReactNode
  action?:  ReactNode
}>) {
  return (
    <div className="mb-5 border-b border-dashed border-border pb-4">
      {eyebrow && (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      )}
      <div className="mt-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-bold leading-tight text-foreground">{title}</h1>
          {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
