/**
 * components/marketing/charter/artefacts/ArtefactStateAccess.tsx
 * §04 Access Continuity — PAID and OVERDUE both show DATA · OPEN
 */
export function ArtefactStateAccess() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Two account states side by side: PAID and OVERDUE, both showing DATA OPEN verdict — access is never revoked"
    >
      {/* PAID box */}
      <rect x="4" y="4" width="88" height="48" rx="2" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.35"/>
      <text x="48" y="22" fontFamily="var(--pub-mono)" fontSize="8" fill="currentColor" opacity="0.55" textAnchor="middle" letterSpacing="0.12em" fontWeight="600">PAID</text>
      <line x1="14" y1="28" x2="82" y2="28" stroke="currentColor" strokeWidth="0.4" opacity="0.2"/>
      <text x="48" y="42" fontFamily="var(--pub-mono)" fontSize="8" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.1em" fontWeight="700">DATA · OPEN</text>

      {/* Divider between boxes */}
      <text x="100" y="32" fontFamily="var(--pub-mono)" fontSize="8" fill="currentColor" opacity="0.2" textAnchor="middle">/</text>

      {/* OVERDUE box */}
      <rect x="108" y="4" width="88" height="48" rx="2" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.3"/>
      <text x="152" y="22" fontFamily="var(--pub-mono)" fontSize="8" fill="currentColor" opacity="0.45" textAnchor="middle" letterSpacing="0.1em" fontWeight="600">OVERDUE</text>
      <line x1="118" y1="28" x2="186" y2="28" stroke="currentColor" strokeWidth="0.4" opacity="0.15"/>
      <text x="152" y="42" fontFamily="var(--pub-mono)" fontSize="8" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.1em" fontWeight="700">DATA · OPEN</text>
    </svg>
  )
}
