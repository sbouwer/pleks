/**
 * lib/reports/screening/_web/primitives/ObservedStrengths.tsx — §4.1 observed strengths/concerns
 *
 * Notes:  Web parity for _pdf/primitives/ObservedStrengths.tsx.
 *         Observed strengths, concerns, and limited-visibility bullets from the narrative engine.
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { SectionHeader } from "./SectionHeader"
import { BlockHeader }   from "./BlockHeader"

type BulletVariant = "normal" | "concern" | "faint"

function bulletTextCls(variant: BulletVariant): string {
  if (variant === "concern") return "text-foreground"
  if (variant === "faint")   return "text-muted-foreground"
  return "text-foreground/70"
}

function BulletList({ bullets, variant = "normal" }: Readonly<{
  bullets: string[]; variant?: BulletVariant
}>): JSX.Element {
  const textCls = bulletTextCls(variant)
  return (
    <div className="flex flex-col gap-1.5">
      {bullets.map((b, i) => (
        <div key={`${i}-${b.slice(0, 16)}`} className="flex gap-2 items-start">
          <span className="font-mono text-[10px] text-muted-foreground/30 mt-px shrink-0">·</span>
          <span className={`text-sm leading-relaxed ${textCls}`}>{b}</span>
        </div>
      ))}
    </div>
  )
}

interface ObservedStrengthsProps {
  data: FitScoreReportData
}

export function ObservedStrengths({ data }: Readonly<ObservedStrengthsProps>): JSX.Element {
  const strengths   = data.narrative.observedStrengths
  const concerns    = data.narrative.observedConcerns
  const limited     = data.narrative.limitedVisibility
  const hasConcerns = concerns.length > 0
  const hasLimited  = limited.length > 0

  return (
    <div className="mb-5">
      <SectionHeader badge="4" title="Assessment narrative" />
      <div className="border border-border bg-card">
        <BlockHeader label="4.1" title="Observed strengths, concerns and limited visibility" />
        <div className="px-4 pt-4 pb-4">
          {strengths.length > 0 && (
            <div className={hasConcerns || hasLimited ? "mb-4 pb-4 border-b border-border" : ""}>
              <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-2">Observed strengths</p>
              <BulletList bullets={strengths} />
            </div>
          )}
          {hasConcerns && (
            <div className={hasLimited ? "mb-4 pb-4 border-b border-border" : ""}>
              <p className="font-mono text-[8px] uppercase tracking-widest text-amber-700 mb-2">Observed concerns</p>
              <BulletList bullets={concerns} variant="concern" />
            </div>
          )}
          {hasLimited && (
            <div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-2">Limited visibility</p>
              <BulletList bullets={limited} variant="faint" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
