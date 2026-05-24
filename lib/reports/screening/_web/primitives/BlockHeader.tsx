/**
 * lib/reports/screening/_web/primitives/BlockHeader.tsx — data-block heading row
 *
 * Notes:  Web parity for _pdf/primitives/BlockHeader.tsx. Emits id={toDocAnchorId(label)} so
 *         cross-reference anchor chips can link to numbered subsections.
 */
import type { JSX } from "react"
import { toDocAnchorId } from "@/lib/reports/screening/_primitives/anchors"

interface BlockHeaderProps {
  label:     string
  title:     string
  rightTag?: string
}

export function BlockHeader({ label, title, rightTag }: Readonly<BlockHeaderProps>): JSX.Element {
  return (
    <div id={toDocAnchorId(label)} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/20">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
      {rightTag && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">{rightTag}</span>
      )}
    </div>
  )
}
