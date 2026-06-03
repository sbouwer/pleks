/**
 * components/detail/DetailCard.tsx — the detail-page body card (dashboard card grammar)
 *
 * Notes:  Matches the dashboard panels (FinancialsPanel et al.): a square card with an amber bottom-border
 *         accent, a header carrying the amber tick + title (+ optional count) and an optional "more" link,
 *         then the body. Replaces the old soft shadcn SectionCard on detail pages. `flush` drops the body
 *         padding for edge-to-edge content like DetailStatGrid. Presentation-only; used across the trio.
 */
import type { ReactNode } from "react"
import { InlineLink } from "@/components/ui/actions"
import { cn } from "@/lib/utils"

export function DetailCard({
  title, count, action, headerAction, flush, children,
}: Readonly<{
  title: string
  count?: number
  action?: { label: string; href: string }
  /** interactive header control (e.g. an Add button) rendered on the header right. */
  headerAction?: ReactNode
  flush?: boolean
  children: ReactNode
}>) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
          {title}
          {count !== undefined && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{count}</span>
          )}
        </h2>
        {action && <InlineLink href={action.href} withArrow>{action.label}</InlineLink>}
        {headerAction}
      </div>
      <div className={cn("flex-1", !flush && "p-5")}>{children}</div>
    </div>
  )
}

/** 2-col stat grid matching the mockup's `.det-attr`: per-cell top/left borders minus the first row/column
 *  (no full-bleed divider lines), and rows that stretch to fill the card so there's no bottom gap. */
export function DetailStatGrid({
  stats,
}: Readonly<{ stats: ReadonlyArray<{ label: string; value: string; tone?: "ok" }> }>) {
  return (
    <div className="grid h-full auto-rows-fr grid-cols-2">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "px-4 py-3",
            i % 2 === 1 && "border-l border-border",
            i >= 2 && "border-t border-border",
          )}
        >
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className={cn("mt-0.5 font-heading text-[15px] leading-snug break-words", s.tone === "ok" && "text-emerald-600")}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}
