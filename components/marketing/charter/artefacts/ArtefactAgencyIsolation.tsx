/**
 * components/marketing/charter/artefacts/ArtefactAgencyIsolation.tsx
 * §07 Agency Isolation — two FitScore dials (A:72, B:81) with × between, "SCORED FRESH" caption
 */
export function ArtefactAgencyIsolation() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Two FitScore dials for the same applicant: Agency A scores 72 and Agency B scores 81 — scored fresh each time with no cross-agency pooling"
    >
      {/* Agency A dial */}
      <circle cx="44" cy="26" r="20" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25"/>
      <circle cx="44" cy="26" r="14" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>
      <text x="44" y="30" fontFamily="var(--pub-mono)" fontSize="12" fontWeight="700" fill="currentColor" opacity="0.7" textAnchor="middle">72</text>
      <text x="44" y="7" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.4" textAnchor="middle" letterSpacing="0.1em">AGENCY A</text>

      {/* × between dials — amber */}
      <text x="100" y="30" fontFamily="var(--pub-mono)" fontSize="14" fill="var(--amber-ink)" textAnchor="middle" fontWeight="700">×</text>

      {/* Agency B dial */}
      <circle cx="156" cy="26" r="20" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25"/>
      <circle cx="156" cy="26" r="14" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>
      <text x="156" y="30" fontFamily="var(--pub-mono)" fontSize="12" fontWeight="700" fill="currentColor" opacity="0.7" textAnchor="middle">81</text>
      <text x="156" y="7" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.4" textAnchor="middle" letterSpacing="0.1em">AGENCY B</text>

      {/* Divider */}
      <line x1="0" y1="52" x2="200" y2="52" stroke="currentColor" strokeWidth="0.4" opacity="0.15"/>

      {/* Caption */}
      <text x="100" y="56" fontFamily="var(--pub-mono)" fontSize="5.5" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.08em" fontWeight="600">SAME APPLICANT · SCORED FRESH · EACH MANDATE</text>
    </svg>
  )
}
