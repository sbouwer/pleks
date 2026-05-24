/**
 * lib/reports/screening/_web/SectionNav.tsx — Sticky section navigation for the web FitScore report
 *
 * Notes: Simple anchor-link nav that sticks to the top of the FitScore section area.
 *        No JavaScript required — pure CSS sticky with smooth-scroll.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md Phase F.2.
 */

interface NavSection {
  id: string
  label: string
}

interface SectionNavProps {
  sections: NavSection[]
}

export function SectionNav({ sections }: Readonly<SectionNavProps>) {
  return (
    <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b border-border flex gap-4 flex-wrap">
      {sections.map(s => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors scroll-smooth"
        >
          {s.label}
        </a>
      ))}
    </div>
  )
}
