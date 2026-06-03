/**
 * components/detail/DetailTypeBadge.tsx — the type chip next to a detail page's status pill
 *
 * Notes:  ADDENDUM_SUPPLIER_DETAIL / the universal type-flexing detail. A neutral outline chip carrying the
 *         entity's type (e.g. UTILITY, SCHEME SERVICE, TRUST, INDIVIDUAL, COMPANY) with an optional icon —
 *         the same chip across the contact trio so the header reads consistently. Presentation-only.
 */
import { createElement } from "react"
import type { LucideIcon } from "lucide-react"

export function DetailTypeBadge({ label, icon }: Readonly<{ label: string; icon?: LucideIcon }>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-border bg-muted/40 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
      {icon && createElement(icon, { className: "h-3 w-3" })}
      {label}
    </span>
  )
}
