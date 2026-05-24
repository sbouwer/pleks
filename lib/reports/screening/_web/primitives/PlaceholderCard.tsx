/**
 * lib/reports/screening/_web/primitives/PlaceholderCard.tsx — shared placeholder states
 *
 * Notes:  Web parity for _pdf/primitives/PlaceholderCard.tsx.
 *         pending = amber dashed; not-solicited = grey dashed;
 *         not-applicable = muted solid; notAssessed = muted solid (LDP null dimensions).
 */
import type { JSX } from "react"

export type PlaceholderVariant = "pending" | "not-solicited" | "not-applicable" | "notAssessed"

const LABELS: Record<PlaceholderVariant, string> = {
  "pending":       "PENDING",
  "not-solicited": "NOT SOLICITED",
  "not-applicable":"NOT APPLICABLE",
  "notAssessed":   "NOT ASSESSED",
}

function variantCls(v: PlaceholderVariant): { card: string; label: string; msg: string } {
  if (v === "pending") return {
    card:  "border border-dashed border-amber-600 bg-amber-50",
    label: "text-amber-700",
    msg:   "text-foreground/70",
  }
  if (v === "not-solicited") return {
    card:  "border border-dashed border-border bg-muted/20",
    label: "text-muted-foreground",
    msg:   "text-muted-foreground",
  }
  return {
    card:  "border border-border bg-muted/20",
    label: "text-muted-foreground/60",
    msg:   "text-muted-foreground/50",
  }
}

interface PlaceholderCardProps {
  variant: PlaceholderVariant
  message: string
}

export function PlaceholderCard({ variant, message }: Readonly<PlaceholderCardProps>): JSX.Element {
  const cls = variantCls(variant)
  return (
    <div className={`rounded px-4 py-3 ${cls.card}`}>
      <p className={`font-mono text-[9px] tracking-widest mb-1 ${cls.label}`}>{LABELS[variant]}</p>
      <p className={`text-xs leading-relaxed ${cls.msg}`}>{message}</p>
    </div>
  )
}
