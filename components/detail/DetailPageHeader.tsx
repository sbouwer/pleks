/**
 * components/detail/DetailPageHeader.tsx — the universal detail-page sticky header zone
 *
 * Notes:  ADDENDUM_DETAIL_PAGE_TEMPLATE §1/§2. The detail analogue of ResourcePageHeader: same sticky/
 *         canvas rhythm, but the eyebrow is a back-link, the title row carries a status pill, and the
 *         listhead is a key-facts strip (left) + the quick-action toolbar slot (right) over the dashed
 *         rule. Presentation-only (server-renderable). Tabs are an optional slot (opt-in per page).
 *         backHref/category support nested detail (a unit points back at its parent property, not a list).
 */
import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"

const PILL: Record<DetailStatus["kind"], string> = {
  occupied: "bg-success/10 text-success border-success/30",
  vacant: "bg-warning/10 text-warning border-warning/30",
  flag: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
}
const DOT: Record<DetailStatus["kind"], string> = {
  occupied: "bg-success", vacant: "bg-warning", flag: "bg-destructive", neutral: "bg-muted-foreground",
}

function StatusPill({ status }: Readonly<{ status: DetailStatus }>) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[var(--r-button)] border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.07em]", PILL[status.kind])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status.kind])} />
      {status.label}
    </span>
  )
}

function Fact({ fact }: Readonly<{ fact: DetailFact }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.09em] text-muted-foreground">{fact.k}</span>
      <span className={cn("text-[13px] font-semibold text-foreground", fact.mono && "font-mono tabular-nums", fact.tone === "ok" && "text-success")}>
        {fact.v}
      </span>
    </div>
  )
}

export function DetailPageHeader({
  category, backHref, title, status, facts, actions, tabs,
}: Readonly<{
  category: string
  backHref: string
  title: ReactNode
  status?: DetailStatus
  facts: DetailFact[]
  actions?: ReactNode
  tabs?: ReactNode
}>) {
  return (
    <div
      className="sticky -top-6 z-30 -mx-6 -mt-6 mb-5 px-6 pt-6 pb-5"
      style={{ background: "color-mix(in oklab, var(--muted) 30%, var(--background))" }}
    >
      <Link
        href={backHref}
        className="group inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-brand"
      >
        <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        {category}
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-bold leading-tight text-foreground">{title}</h1>
        {status && <StatusPill status={status} />}
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          {facts.map((f) => <Fact key={f.k} fact={f} />)}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  )
}
