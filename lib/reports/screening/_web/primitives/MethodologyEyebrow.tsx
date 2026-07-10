/**
 * lib/reports/screening/_web/primitives/MethodologyEyebrow.tsx
 *
 * Framing primitive: full-width strip rendered above DimensionCardEditorial when the
 * evidentiary class changes methodology. Structural declaration styling (not alert banner).
 * Web parity for _pdf/primitives/MethodologyEyebrow.tsx.
 * Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §6.3/§6.4; D-DSP-16/17/18.
 */
import type { JSX } from "react"

export type MethodologyEyebrowVariant = 'foreign-national-evidentiary-class'

const EYEBROW_CONTENT: Record<MethodologyEyebrowVariant, { title: string; body: string }> = {
  'foreign-national-evidentiary-class': {
    title: 'Three-dimension methodology · Foreign-national evidentiary class',
    body:  'Credit Behaviour is not assessed where South African bureau coverage is unavailable for all applicants. ' +
           'Affordability, Stability, and Verification Integrity carry additional weight in the composite methodology.',
  },
}

interface MethodologyEyebrowProps {
  variant: MethodologyEyebrowVariant
}

export function MethodologyEyebrow({ variant }: Readonly<MethodologyEyebrowProps>): JSX.Element {
  const content = EYEBROW_CONTENT[variant]
  return (
    <div className="border border-border bg-card px-4 py-3 mb-5">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
        {content.title}
      </p>
      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        {content.body}
      </p>
    </div>
  )
}
