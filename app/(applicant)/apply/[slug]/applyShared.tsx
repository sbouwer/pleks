/**
 * app/(applicant)/apply/[slug]/applyShared.tsx — shared presentational bricks for the apply wizard
 *
 * Notes:  StepHeading — the section heading brick shared across step modules (applyCompany + applyReview).
 *         Per the apply-flow architecture the FLOWS are separate concerns; only bricks/styling like this are
 *         shared. No state, no flow logic — pure presentation. (Single-use bricks live with their one consumer.)
 */

export function StepHeading({ title, sub, subOnly }: Readonly<{ title: string; sub: string; subOnly?: boolean }>) {
  // subOnly = the panel header already shows the title (step · section), so render just the info line.
  if (subOnly) return <p className="text-sm text-[var(--ink-soft)]">{sub}</p>
  return (
    <div>
      <h2 className="text-xl font-medium tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{sub}</p>
    </div>
  )
}
