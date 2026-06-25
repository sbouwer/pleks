/**
 * app/(applicant)/apply/[slug]/applyShared.tsx — shared presentational bricks for the apply wizard
 *
 * Notes:  Tiny brand/style helpers shared by the orchestrator AND both flow modules (individual + company).
 *         Per the apply-flow architecture the FLOWS are separate concerns; only bricks/styling like these are
 *         shared. No state, no flow logic — pure presentation.
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

export function SectionEyebrow({ n, label }: Readonly<{ n: string; label: string }>) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-mute)]">{n} · {label}</span>
      <span aria-hidden className="h-px flex-1 bg-[var(--rule)]" />
    </div>
  )
}
