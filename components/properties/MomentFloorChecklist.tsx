"use client"

/**
 * components/properties/MomentFloorChecklist.tsx — BUILD_69: surface a journey moment's required floor in-flow
 *
 * Data:   a MomentCompleteness (lib/properties/journeyCompleteness) computed server-side from the live context
 * Notes:  The de-walling mechanic — instead of dropping all setup at signing, each contact moment shows what
 *         its required floor still needs. Compact + non-blocking: lists the missing field labels, or a quiet
 *         "all set" when complete. Reused at listing / signing / ingoing.
 */
import { Check } from "lucide-react"
import type { MomentCompleteness } from "@/lib/properties/journeyCompleteness"

export function MomentFloorChecklist({
  completeness, heading,
}: Readonly<{ completeness: MomentCompleteness; heading: string }>) {
  const { total, filled, complete, missing } = completeness
  if (total === 0) return null

  return (
    <div className="rounded-[var(--r-button)] border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{heading}</span>
        <span className={`text-xs ${complete ? "text-success" : "text-muted-foreground"}`}>{filled}/{total}</span>
      </div>
      {complete ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-success">
          <Check className="size-3.5" aria-hidden /> All set
        </p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {missing.map((f) => (
            <li key={f.key} className="text-xs text-muted-foreground">• {f.label}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
