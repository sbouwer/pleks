/**
 * lib/reports/screening/_web/primitives/SectionHeader.tsx — §-section heading with badge and amber accent
 *
 * Notes:  Web parity for _pdf/primitives/SectionHeader.tsx. Emits id={toDocAnchorId(badge)} for
 *         in-document anchor navigation. Exports toDocAnchorId — used by BlockHeader and chips.
 */
import type { JSX } from "react"

export function toDocAnchorId(docRef: string): string {
  return "fs-" + docRef.toLowerCase().replaceAll(".", "-")
}

interface SectionHeaderProps {
  badge:       string
  title:       string
  rightLabel?: string
}

export function SectionHeader({ badge, title, rightLabel }: Readonly<SectionHeaderProps>): JSX.Element {
  return (
    <div id={toDocAnchorId(badge)} className="relative flex items-end gap-3 mb-4 pb-3 border-b-2 border-foreground">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded-full px-2.5 py-0.5 shrink-0">
        {badge}
      </span>
      <span className="font-bold text-xl text-foreground flex-1 leading-tight">{title}</span>
      {rightLabel && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">{rightLabel}</span>
      )}
      <div className="absolute bottom-0 left-[36%] w-[8%] h-0.5 bg-amber-600" />
    </div>
  )
}
