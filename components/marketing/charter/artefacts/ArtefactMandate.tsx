/**
 * components/marketing/charter/artefacts/ArtefactMandate.tsx
 * §02 Tenant Data — mandate flow diagram: Tenant Bank → Agency Trust, Pleks crossed out
 */
export function ArtefactMandate() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Mandate diagram showing rent flowing from tenant bank to agency trust account, with Pleks crossed out as an intermediary"
    >
      {/* Tenant Bank box */}
      <rect x="2" y="10" width="62" height="22" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
      <text x="33" y="24" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.7" textAnchor="middle" fontWeight="500">TENANT BANK</text>

      {/* Arrow */}
      <line x1="64" y1="21" x2="88" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
      <polygon points="88,18 94,21 88,24" fill="currentColor" opacity="0.4"/>

      {/* Agency Trust box */}
      <rect x="94" y="10" width="64" height="22" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
      <text x="126" y="24" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.7" textAnchor="middle" fontWeight="500">AGENCY TRUST</text>

      {/* Pleks box — detached, dashed, struck through */}
      <rect x="168" y="10" width="30" height="22" rx="1" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.3"/>
      <text x="183" y="24" fontFamily="var(--pub-mono)" fontSize="5" fill="currentColor" opacity="0.3" textAnchor="middle">PLEKS</text>
      {/* Strikethrough diagonal */}
      <line x1="168" y1="10" x2="198" y2="32" stroke="var(--amber-ink)" strokeWidth="1.2" strokeLinecap="round"/>

      {/* Divider */}
      <line x1="0" y1="37" x2="200" y2="37" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>

      {/* Footnote */}
      <text x="100" y="50" fontFamily="var(--pub-mono)" fontSize="6" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.08em" fontWeight="500">PLEKS · OBSERVES, NEVER HANDLES</text>
    </svg>
  )
}
