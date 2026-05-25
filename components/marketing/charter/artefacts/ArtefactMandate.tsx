/**
 * components/marketing/charter/artefacts/ArtefactMandate.tsx
 * §02 Tenant Data — mandate flow: Tenant Bank → Agency Trust, Pleks below as observer
 */
export function ArtefactMandate() {
  return (
    <svg
      viewBox="0 0 200 60"
      width="100%"
      height="60"
      role="img"
      aria-label="Mandate diagram showing rent flowing directly from tenant bank to agency trust account, with Pleks positioned below as an observer only — never in the payment path"
    >
      {/* Tenant Bank box */}
      <rect x="2" y="6" width="66" height="22" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
      <text x="35" y="20" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.7" textAnchor="middle" fontWeight="500">TENANT BANK</text>

      {/* Arrow — the actual payment rail */}
      <line x1="68" y1="17" x2="90" y2="17" stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
      <polygon points="90,14 96,17 90,20" fill="currentColor" opacity="0.4"/>

      {/* Agency Trust box */}
      <rect x="96" y="6" width="72" height="22" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
      <text x="132" y="20" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.7" textAnchor="middle" fontWeight="500">AGENCY TRUST</text>

      {/* Dotted observer sightline from flow midpoint down to Pleks */}
      <line x1="82" y1="28" x2="82" y2="38" stroke="var(--amber-ink)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.6"/>

      {/* Pleks observer box — below the flow, dashed amber border */}
      <rect x="42" y="38" width="80" height="16" rx="1" fill="none" stroke="var(--amber-ink)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.5"/>
      <text x="82" y="49" fontFamily="var(--pub-mono)" fontSize="5.5" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.1em" fontWeight="600">PLEKS · READS ONLY</text>
    </svg>
  )
}
